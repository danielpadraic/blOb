import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  buzz,
  cuesMuted,
  playCue,
  primeCues,
  releaseCues,
  setCuesMuted,
  type LiftCue,
} from '@/lib/lift/cues';
import { formatDuration } from '@/lib/lift/duration';
import {
  roundKindLabel,
  roundKindShortLabel,
  type LiftPlayBlock,
  type LiftPlaySpec,
} from '@/lib/lift/rounds';
import { THEME } from '@/lib/theme';
import { holdScreenAwake, reacquireScreenAwake, releaseScreenAwake } from '@/lib/lift/wakeLock';

/**
 * The gym timer.
 *
 * Rendered by `LiftPlayHost` at the root of the tab layout so it covers the header and the
 * floating tab bar. It is still an overlay rather than a route because Play must not leave
 * Logging: the draft, the autosave, and the rounds all stay mounted underneath, so exiting
 * mid-timer puts someone back on the same card with the same numbers and no save in between.
 * The standalone timer opens the same overlay with a preset instead of an exercise.
 *
 * The clock runs off wall time, not off a tick counter. A setInterval that fires ten times a
 * second will not fire ten times a second — the tab backgrounds, the phone throttles, Safari
 * coalesces — and a Tabata that drifts eight seconds over four minutes is a broken Tabata.
 * Comparing against `Date.now()` means the display can lag but the interval cannot, and it is what
 * lets the timer land on the correct round after the OS suspends the page entirely.
 */

const PREROLL_SECONDS = 3;
/** How many seconds of a round get counted down out loud before it hands over. */
const COUNT_IN_SECONDS = 3;
/** Fast enough that the clock never visibly skips a second. */
const FRAME_MS = 100;
/**
 * A gap this long between ticks means the OS suspended us rather than merely throttled us.
 *
 * Anything under it is normal jitter and advances one round at a time with its cues. Over it, the
 * rounds that elapsed while the screen was off are caught up silently — replaying eight whistles
 * for intervals nobody heard would be noise, not information.
 */
const SUSPEND_GAP_MS = 2500;

type LiftPlayOverlayProps = {
  spec: LiftPlaySpec;
  onClose: () => void;
};

type Phase = 'preroll' | 'running' | 'paused' | 'done';

export function LiftPlayOverlay({ spec, onClose }: LiftPlayOverlayProps) {
  // Snapshotted once. Logging re-renders on every autosave, and recomputing this from the spec
  // would hand the timer a fresh array mid-sprint and restart it from round one.
  const [blocks] = useState<LiftPlayBlock[]>(() => spec.blocks);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(() =>
    blocks.length ? (needsPreroll(blocks[0], 0) ? 'preroll' : 'running') : 'done',
  );
  const [remaining, setRemaining] = useState(() => blocks[0]?.seconds ?? 0);
  const [prerollLeft, setPrerollLeft] = useState(PREROLL_SECONDS);
  const [muted, setMuted] = useState(() => cuesMuted());
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const block = blocks[index] ?? null;
  const next = blocks[index + 1] ?? null;

  /**
   * Whether this round's last three seconds get counted down.
   *
   * A work round opens with its own three-second pre-roll, so counting the round before it down as
   * well would run 3-2-1 twice back to back — six seconds of counting for one handover. The count
   * therefore fills in exactly where the pre-roll does not: sprint into recovery, and the final
   * round into the end of the session.
   */
  const countsIn = !next || !needsPreroll(next, index + 1);

  // Wall-clock anchors. `endsAt` is the only source of truth for how much time is left; the state
  // above is just what the screen is currently showing.
  const endsAt = useRef<number>(0);
  const pausedLeft = useRef<number>(0);
  const pausedPhase = useRef<Phase>('running');
  const cued = useRef<Set<string>>(new Set());
  /** Detects the gap left behind when the OS stops running our interval. */
  const lastTick = useRef<number>(Date.now());

  // Lazy one-time anchor. This has to be set before the first tick rather than in an effect,
  // because an unset deadline reads as "already expired" and would skip round one outright.
  if (endsAt.current === 0 && blocks.length) {
    const first = blocks[0];
    const opening = needsPreroll(first, 0) ? PREROLL_SECONDS : first.seconds;
    endsAt.current = Date.now() + opening * 1000;
  }

  // Play is only ever opened by a tap, which is the gesture Safari requires before a page may
  // make any sound at all, and the moment native is allowed to take an audio session.
  useEffect(() => {
    void primeCues();
    return () => releaseCues();
  }, []);

  // Hold the screen on for the whole session. On web a locked screen suspends the page outright,
  // so preventing the lock is the only way the clock keeps running out loud there.
  useEffect(() => {
    void holdScreenAwake();
    return () => {
      void releaseScreenAwake();
    };
  }, []);

  // Browsers hand the wake lock back the instant the tab hides and never return it unasked.
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') {
        return undefined;
      }
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          void reacquireScreenAwake();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void holdScreenAwake();
      }
    });
    return () => subscription.remove();
  }, []);

  const startBlock = useCallback(
    (at: number, withPreroll: boolean, options?: { silent?: boolean; elapsed?: number }) => {
      const target = blocks[at];
      if (!target) {
        setPhase('done');
        return;
      }
      cued.current = new Set();
      setIndex(at);

      const silent = Boolean(options?.silent);
      // Carried over from a suspension: the round is already partly gone by the time we get here.
      const spent = Math.max(0, options?.elapsed ?? 0);

      if (withPreroll && spent < PREROLL_SECONDS) {
        setRemaining(target.seconds);
        setPrerollLeft(PREROLL_SECONDS - spent);
        setPhase('preroll');
        endsAt.current = Date.now() + (PREROLL_SECONDS - spent) * 1000;
        return;
      }

      const offset = withPreroll ? spent - PREROLL_SECONDS : spent;
      const left = Math.max(0, target.seconds - offset);
      setRemaining(left);
      setPhase('running');
      endsAt.current = Date.now() + left * 1000;
      // A round begun without its three-count still announces itself, unless we are fast-forwarding
      // through rounds that already happened behind a dark screen.
      if (!silent) {
        buzz(target.work ? 'work' : 'recovery');
        if (target.work) {
          cued.current.add(`whistle-${at}`);
          playCue('whistle');
        }
      }
    },
    [blocks],
  );

  /**
   * Walks forward to the round the wall clock says we are actually on.
   *
   * The screen was off, or the tab was buried, and JavaScript stopped. The elapsed time is real
   * even though none of the intervening rounds were counted down, so this finds where the workout
   * genuinely is instead of advancing one round per tick and firing a burst of stale whistles.
   */
  const catchUp = useCallback(
    (overshoot: number) => {
      let spent = overshoot;
      let at = index + 1;
      while (at < blocks.length) {
        const target = blocks[at];
        const span = (needsPreroll(target, at) ? PREROLL_SECONDS : 0) + target.seconds;
        if (spent < span) {
          break;
        }
        spent -= span;
        at += 1;
      }
      if (at >= blocks.length) {
        setPhase('done');
        return;
      }
      const landed = blocks[at];
      const skipped = at > index + 1;
      startBlock(at, needsPreroll(landed, at), { silent: skipped, elapsed: spent });
      // One buzz on return, so a glance at the phone is not needed to know the round changed.
      if (skipped) {
        buzz(landed.work ? 'work' : 'recovery');
      }
    },
    [blocks, index, startBlock],
  );

  useEffect(() => {
    if (phase === 'paused' || phase === 'done' || !block) {
      return undefined;
    }

    // The tick runs ten times a second, so every cue needs a one-shot token or the bell would
    // retrigger on every frame of the final second.
    const fire = (cue: LiftCue, token: string) => {
      if (cued.current.has(token)) {
        return;
      }
      cued.current.add(token);
      playCue(cue);
    };

    lastTick.current = Date.now();

    const handle = setInterval(() => {
      const now = Date.now();
      // A long gap means the OS parked us — the screen locked, or the tab went to the background.
      const suspended = now - lastTick.current > SUSPEND_GAP_MS;
      lastTick.current = now;
      const left = Math.max(0, (endsAt.current - now) / 1000);

      if (phase === 'preroll') {
        setPrerollLeft(Math.ceil(left));
        if (left > 0) {
          return;
        }
        // The whistle lands on the start of work, after the three-count, never during it.
        buzz(block.work ? 'work' : 'recovery');
        if (block.work) {
          fire('whistle', `whistle-${index}`);
        }
        setPhase('running');
        setRemaining(block.seconds);
        endsAt.current = now + block.seconds * 1000;
        return;
      }

      setRemaining(left);
      if (left > 0) {
        // Count the handover in out loud. `Math.ceil` puts the pip for "3" on the moment the clock
        // reads 0:03, and the token keeps it to one pip per second rather than one per frame. The
        // buzz shares the token so a muted phone gets three taps, not thirty.
        const pip = Math.ceil(left);
        const token = `tick-${index}-${pip}`;
        if (countsIn && pip <= COUNT_IN_SECONDS && !cued.current.has(token)) {
          cued.current.add(token);
          playCue('tick');
          buzz('count');
        }
        return;
      }

      const overshoot = (now - endsAt.current) / 1000;
      if (suspended) {
        catchUp(overshoot);
        return;
      }

      // The last three seconds of work count down on screen; the bell marks the handover.
      if (block.work) {
        fire('bell', `bell-${index}`);
      }

      const at = index + 1;
      if (at >= blocks.length) {
        setPhase('done');
        buzz('end');
        return;
      }
      startBlock(at, needsPreroll(blocks[at], at));
    }, FRAME_MS);

    return () => clearInterval(handle);
  }, [block, blocks, catchUp, countsIn, index, phase, startBlock]);

  const pause = useCallback(() => {
    pausedLeft.current = Math.max(0, (endsAt.current - Date.now()) / 1000);
    pausedPhase.current = phase === 'preroll' ? 'preroll' : 'running';
    setPhase('paused');
  }, [phase]);

  /**
   * Picks the clock back up exactly where it stopped.
   *
   * No fresh three-count when resuming mid-round: they are already on the machine, and a countdown
   * there would take back the seconds it was supposed to give them. Pausing *during* a three-count
   * is the one case that resumes counting down, because that pause was pre-round.
   */
  const resume = useCallback(() => {
    endsAt.current = Date.now() + pausedLeft.current * 1000;
    setPhase(pausedPhase.current);
  }, []);

  const skip = useCallback(() => {
    const at = index + 1;
    if (at >= blocks.length) {
      setPhase('done');
      return;
    }
    startBlock(at, needsPreroll(blocks[at], at));
  }, [blocks, index, startBlock]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    setCuesMuted(nextMuted);
  }, [muted]);

  // Stop leaves the timer, nothing else. The rounds, the draft, and the unsaved session are all
  // still there — this is not a Save and not a discard.
  const stop = useCallback(() => {
    void releaseScreenAwake();
    onClose();
  }, [onClose]);

  const shown = Math.ceil(remaining);
  const working = phase !== 'done' && isHardBlock(block);
  const finalCount = phase === 'running' && countsIn && shown <= COUNT_IN_SECONDS && shown > 0;
  const tint = phase === 'done' ? THEME.accentBright : kindTint(block);

  // The ring is the loudest thing on the screen, so it takes what room there is and then stops —
  // big on a phone held in one hand, not absurd on a tablet. Height is in the calculation because
  // native is portrait-locked but a browser is not, and a ring sized off width alone would push
  // Pause and Stop off the bottom of a landscape window.
  const dial = Math.max(Math.min(width * 0.66, height * 0.4, 320), 140);

  // Fraction of the current block still to run. Preroll shows a full ring so the three-count reads
  // as "about to start" rather than as a round already draining away.
  const fraction =
    phase === 'preroll' || !block || block.seconds <= 0
      ? 1
      : Math.max(0, Math.min(1, remaining / block.seconds));

  const elapsedRounds = blocks.slice(0, index).reduce((total, item) => total + item.seconds, 0);
  const totalSeconds = blocks.reduce((total, item) => total + item.seconds, 0);
  const leftOverall = Math.max(0, totalSeconds - elapsedRounds - (block ? block.seconds - shown : 0));

  return (
    <View
      // Fills whatever it is mounted into. `LiftPlayHost` mounts it at the root of the tab layout,
      // above the header and the floating tab bar, so the clock genuinely owns the screen and
      // nothing behind it can be reached by a stray thumb mid-sprint.
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        // Explicit dimensions on web so the layer covers the viewport even where an ancestor has
        // clipped or transformed its children.
        ...(Platform.OS === 'web'
          ? { position: 'fixed' as never, width: '100%' as never, height: '100%' as never }
          : null),
        // Work and recovery get their own near-black. It is a small shift, but it is the one signal
        // that reads from across a gym floor with the phone propped on a bench.
        backgroundColor: working ? WORK_BACKDROP : REST_BACKDROP,
      }}>
      <View
        style={{
          flex: 1,
          paddingTop: Math.max(insets.top, 12) + 8,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 12) + 8,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ChromeButton
            glyph={muted ? GLYPH.mute : GLYPH.unmute}
            label={muted ? 'Unmute timer cues' : 'Mute timer cues'}
            onPress={toggleMute}
          />
          <View style={{ flex: 1, alignItems: 'center' }}>
            {phase === 'done' ? null : (
              <AppText
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.42)',
                  fontVariant: ['tabular-nums'],
                }}>
                {formatDuration(leftOverall)} left
              </AppText>
            )}
          </View>
          <ChromeButton glyph={GLYPH.close} label="Exit the timer" onPress={stop} />
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText
            numberOfLines={1}
            style={{
              fontSize: 26,
              fontWeight: '900',
              letterSpacing: -0.4,
              color: tint,
            }}>
            {phase === 'done' ? 'Session block done' : roundKindLabel(block?.kind ?? 'on')}
          </AppText>

          <AppText
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontSize: 14,
              fontWeight: '700',
              color: 'rgba(255,255,255,0.45)',
            }}>
            {spec.title}
          </AppText>

          {phase === 'done' ? (
            <View style={{ marginTop: 30, alignItems: 'center', gap: 18 }}>
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(114,217,203,0.14)',
                }}>
                <Glyph name={GLYPH.checkmark} color={THEME.accentBright} size={44} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done, back to the session"
                onPress={stop}
                style={({ pressed }) => ({
                  minHeight: 54,
                  paddingHorizontal: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: THEME.accentForeground,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <AppText style={{ fontSize: 16, fontWeight: '800', color: THEME.textPrimary }}>
                  Done
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              <Dial size={dial} fraction={fraction} tint={tint} />
              <View
                // The clock sits in the middle of the ring rather than under it. One thing to look
                // at, and the ring reads as the round emptying out around it.
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {phase === 'preroll' ? (
                  <AppText
                    style={{
                      fontSize: dial * 0.46,
                      lineHeight: dial * 0.52,
                      fontWeight: '900',
                      color: THEME.accentForeground,
                      fontVariant: ['tabular-nums'],
                    }}>
                    {Math.max(1, prerollLeft)}
                  </AppText>
                ) : (
                  <>
                    <AppText
                      style={{
                        fontSize: dial * 0.29,
                        lineHeight: dial * 0.34,
                        fontWeight: '900',
                        letterSpacing: -2,
                        // The last three seconds of work turn the clock itself into the countdown,
                        // so a muted phone across the room still shows the handover coming.
                        color: finalCount ? THEME.accentBright : THEME.accentForeground,
                        fontVariant: ['tabular-nums'],
                      }}>
                      {formatDuration(shown)}
                    </AppText>
                    <AppText
                      style={{
                        marginTop: 2,
                        fontSize: 13,
                        fontWeight: '800',
                        letterSpacing: 0.6,
                        color: 'rgba(255,255,255,0.5)',
                        fontVariant: ['tabular-nums'],
                      }}>
                      Round {index + 1} / {blocks.length}
                    </AppText>
                    {phase === 'paused' ? (
                      <AppText
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          fontWeight: '900',
                          letterSpacing: 1.4,
                          textTransform: 'uppercase',
                          color: THEME.accentBright,
                        }}>
                        Paused
                      </AppText>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          )}

          {phase === 'done' ? null : (
            <AppText
              numberOfLines={1}
              style={{
                marginTop: 16,
                fontSize: 14,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.42)',
                fontVariant: ['tabular-nums'],
              }}>
              {next
                ? `Next: ${roundKindLabel(next.kind)} ${formatDuration(next.seconds)}`
                : 'Last round'}
            </AppText>
          )}
        </View>

        {phase === 'done' ? null : <UpcomingList blocks={blocks} index={index} />}

        {phase === 'done' ? null : (
          <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={phase === 'paused' ? 'Resume the timer' : 'Pause the timer'}
              onPress={phase === 'paused' ? resume : pause}
              style={({ pressed }) => ({
                flex: 2,
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 999,
                backgroundColor: THEME.accentForeground,
                opacity: pressed ? 0.8 : 1,
              })}>
              <Glyph
                name={phase === 'paused' ? GLYPH.play : GLYPH.pause}
                color={THEME.textPrimary}
                size={19}
              />
              <AppText style={{ fontSize: 16, fontWeight: '800', color: THEME.textPrimary }}>
                {phase === 'paused' ? 'Resume' : 'Pause'}
              </AppText>
            </Pressable>
            <OutlineControl label="Skip this round" title="Skip" onPress={skip} />
            {/* Stop, not Save. It closes the timer and hands back the editor with every round
                intact — spelled out because an X alone reads as "throw this away". */}
            <OutlineControl label="Stop the timer" title="Stop" onPress={stop} />
          </View>
        )}
      </View>
    </View>
  );
}

/** Deep neutrals rather than pure black, so the white type has something to sit on. */
const WORK_BACKDROP = '#0B1512';
const REST_BACKDROP = '#121413';

/**
 * The countdown ring.
 *
 * Driven straight off the remaining fraction with no animation in between. The shared
 * `ProgressRing` eases over 700ms, which is correct for a stat that changes once and wrong for a
 * clock that changes ten times a second — it would trail the number in the middle of it.
 */
function Dial({ size, fraction, tint }: { size: number; fraction: number; tint: string }) {
  const stroke = Math.max(10, Math.round(size * 0.045));
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Twelve o'clock start, draining clockwise, the way every gym clock on a wall reads. */}
      <G transform={`rotate(-90 ${center} ${center})`}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={tint}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </G>
    </Svg>
  );
}

/** Skip and Stop: same weight as each other, quieter than Pause. */
function OutlineControl({
  label,
  title,
  onPress,
}: {
  label: string;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.28)',
        opacity: pressed ? 0.7 : 1,
      })}>
      <AppText style={{ fontSize: 15, fontWeight: '800', color: THEME.accentForeground }}>
        {title}
      </AppText>
    </Pressable>
  );
}

/**
 * The rounds still to come.
 *
 * Deliberately not a second editor — mid-sprint nobody is adjusting a stepper. It exists so
 * someone can see whether the pain ends in thirty seconds or in three minutes.
 */
function UpcomingList({ blocks, index }: { blocks: LiftPlayBlock[]; index: number }) {
  if (blocks.length <= 1) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Without this the strip grows to fill the space between the ring and the controls, and the
      // pills stretch into tall capsules with their labels stranded at the top.
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        gap: 8,
        paddingVertical: 2,
        alignItems: 'center',
        // A two-round session sits in the middle rather than hugging the left edge; a long one
        // still scrolls.
        flexGrow: 1,
        justifyContent: 'center',
      }}>
      {blocks.map((block, at) => {
        const current = at === index;
        const past = at < index;
        const color = current ? THEME.textPrimary : 'rgba(255,255,255,0.7)';
        return (
          <View
            key={block.key}
            style={{
              // Kind over time on two lines, centred, so every pill is the same size and the
              // strip reads as a row of rounds instead of a row of ragged sentences.
              minWidth: 68,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 14,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: current ? kindTint(block) : 'rgba(255,255,255,0.16)',
              backgroundColor: current ? kindTint(block) : 'transparent',
              opacity: past ? 0.3 : 1,
            }}>
            <AppText
              numberOfLines={1}
              style={{
                fontSize: 11,
                fontWeight: '800',
                textAlign: 'center',
                color,
              }}>
              {roundKindShortLabel(block.kind)}
            </AppText>
            <AppText
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontWeight: '800',
                textAlign: 'center',
                color,
                fontVariant: ['tabular-nums'],
              }}>
              {formatDuration(block.seconds)}
            </AppText>
          </View>
        );
      })}
    </ScrollView>
  );
}

function ChromeButton({
  glyph,
  label,
  onPress,
}: {
  glyph: Parameters<typeof Glyph>[0]['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
        opacity: pressed ? 0.6 : 1,
      })}>
      <Glyph name={glyph} color={THEME.accentForeground} size={17} />
    </Pressable>
  );
}

/**
 * Work opens with a three-count; recovery does not.
 *
 * The first block always gets one regardless of kind, because Play starting the instant a thumb
 * leaves the button gives nobody time to get their hands on the bars.
 */
function needsPreroll(block: LiftPlayBlock | undefined, at: number): boolean {
  if (!block) {
    return false;
  }
  return at === 0 || block.work;
}

/**
 * Whether this is the part of the session the screen should shout about.
 *
 * A warm-up and a cool down are work — they earn a countdown in and a bell out — but they are not
 * an all-out interval, and rendering a five minute cool down identically to a thirty second sprint
 * tells the wrong story at a glance. The bright tint and the green backdrop stay reserved for the
 * round you are actually emptying the tank on; the kind label names the rest precisely.
 */
function isHardBlock(block: LiftPlayBlock | null | undefined): boolean {
  if (!block?.work) {
    return false;
  }
  return block.kind !== 'warmup' && block.kind !== 'cooldown';
}

function kindTint(block: LiftPlayBlock | null): string {
  if (!block) {
    return THEME.accentForeground;
  }
  return isHardBlock(block) ? THEME.accentBright : THEME.accent;
}
