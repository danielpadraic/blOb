import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { cuesMuted, playCue, primeCues, releaseCues, setCuesMuted } from '@/lib/lift/cues';
import { formatDuration } from '@/lib/lift/duration';
import { playBlocks, roundKindLabel, type LiftPlayBlock } from '@/lib/lift/rounds';
import { timedRowLabel } from '@/lib/lift/session';
import type { LiftExerciseDraft } from '@/lib/lift/types';
import { THEME } from '@/lib/theme';

/**
 * The gym timer.
 *
 * This is a full-screen overlay rather than a route because Play must not leave Logging: the draft,
 * the autosave, and the rounds all stay mounted underneath, so exiting mid-timer puts someone back
 * on the same card with the same numbers and no save of any kind in between.
 *
 * The clock runs off wall time, not off a tick counter. A setInterval that fires 60 times a minute
 * will not fire 60 times a minute — the tab backgrounds, the phone throttles, Safari coalesces —
 * and a Tabata that drifts eight seconds over four minutes is a broken Tabata. Comparing against
 * `Date.now()` means the display can lag but the interval cannot.
 */

const PREROLL_SECONDS = 3;
/** Fast enough that the clock never visibly skips a second. */
const FRAME_MS = 100;

type LiftPlayOverlayProps = {
  row: LiftExerciseDraft;
  onClose: () => void;
};

type Phase = 'preroll' | 'running' | 'paused' | 'done';

export function LiftPlayOverlay({ row, onClose }: LiftPlayOverlayProps) {
  // Snapshotted once. Logging re-renders on every autosave, and recomputing this from `row` would
  // hand the timer a fresh array mid-sprint and restart it from round one.
  const [blocks] = useState<LiftPlayBlock[]>(() => playBlocks(row));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(() =>
    blocks.length ? (needsPreroll(blocks[0], 0) ? 'preroll' : 'running') : 'done',
  );
  const [remaining, setRemaining] = useState(() => blocks[0]?.seconds ?? 0);
  const [prerollLeft, setPrerollLeft] = useState(PREROLL_SECONDS);
  const [muted, setMuted] = useState(() => cuesMuted());

  const block = blocks[index] ?? null;
  const next = blocks[index + 1] ?? null;

  // Wall-clock anchors. `endsAt` is the only source of truth for how much time is left; the state
  // above is just what the screen is currently showing.
  const endsAt = useRef<number>(0);
  const pausedLeft = useRef<number>(0);
  const pausedPhase = useRef<Phase>('running');
  const cued = useRef<Set<string>>(new Set());

  // Lazy one-time anchor. This has to be set before the first tick rather than in an effect,
  // because an unset deadline reads as "already expired" and would skip round one outright.
  if (endsAt.current === 0 && blocks.length) {
    const first = blocks[0];
    const opening = needsPreroll(first, 0) ? PREROLL_SECONDS : first.seconds;
    endsAt.current = Date.now() + opening * 1000;
  }

  // Play is only ever opened by a tap, which is the gesture Safari requires before a page may
  // make any sound at all.
  useEffect(() => {
    void primeCues();
    return () => releaseCues();
  }, []);

  const startBlock = useCallback(
    (at: number, withPreroll: boolean) => {
      const target = blocks[at];
      if (!target) {
        setPhase('done');
        return;
      }
      cued.current = new Set();
      setIndex(at);
      setRemaining(target.seconds);
      if (withPreroll) {
        setPrerollLeft(PREROLL_SECONDS);
        setPhase('preroll');
        endsAt.current = Date.now() + PREROLL_SECONDS * 1000;
        return;
      }
      setPhase('running');
      endsAt.current = Date.now() + target.seconds * 1000;
    },
    [blocks],
  );

  useEffect(() => {
    if (phase === 'paused' || phase === 'done' || !block) {
      return undefined;
    }

    // The tick runs ten times a second, so every cue needs a one-shot token or the bell would
    // retrigger on every frame of the final second.
    const fire = (cue: 'whistle' | 'bell' | 'tick', token: string) => {
      if (cued.current.has(token)) {
        return;
      }
      cued.current.add(token);
      playCue(cue);
    };

    const handle = setInterval(() => {
      const left = Math.max(0, (endsAt.current - Date.now()) / 1000);

      if (phase === 'preroll') {
        const shown = Math.ceil(left);
        setPrerollLeft(shown);
        if (left <= 0) {
          // The whistle lands on the start of work, after the three-count, never during it.
          if (block.work) {
            fire('whistle', `whistle-${index}`);
          } else {
            fire('tick', `tick-${index}`);
          }
          setPhase('running');
          setRemaining(block.seconds);
          endsAt.current = Date.now() + block.seconds * 1000;
        }
        return;
      }

      setRemaining(left);

      // The last three seconds of work get the on-screen count; the bell marks the handover.
      if (block.work && left <= 0) {
        fire('bell', `bell-${index}`);
      }

      if (left <= 0) {
        const at = index + 1;
        if (at >= blocks.length) {
          setPhase('done');
          return;
        }
        startBlock(at, needsPreroll(blocks[at], at));
      }
    }, FRAME_MS);

    return () => clearInterval(handle);
  }, [block, blocks, index, phase, startBlock]);

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

  const shown = Math.ceil(remaining);
  const finalCount = phase === 'running' && block?.work && shown <= 3 && shown > 0;
  const label = phase === 'done' ? 'Session block done' : roundKindLabel(block?.kind ?? 'on');

  return (
    <View
      // Sits above the header wallet and bell and the floating tab bar. Someone mid-sprint should
      // not be able to catch a notification bell with a stray thumb.
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 9999,
        backgroundColor: THEME.textPrimary,
        ...(Platform.OS === 'web' ? { position: 'fixed' as never } : null),
      }}>
      <View style={{ flex: 1, paddingTop: 54, paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ChromeButton
            glyph={muted ? GLYPH.mute : GLYPH.unmute}
            label={muted ? 'Unmute timer cues' : 'Mute timer cues'}
            onPress={toggleMute}
          />
          <View style={{ flex: 1 }} />
          <ChromeButton glyph={GLYPH.close} label="Exit the timer" onPress={onClose} />
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <AppText
            numberOfLines={1}
            style={{
              fontSize: 30,
              fontWeight: '900',
              letterSpacing: -0.5,
              color: phase === 'done' ? THEME.accentForeground : kindTint(block),
            }}>
            {label}
          </AppText>

          <AppText
            numberOfLines={1}
            style={{ fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.55)' }}>
            {timedRowLabel(row)}
          </AppText>

          {phase === 'preroll' ? (
            <AppText
              style={{
                marginTop: 10,
                fontSize: 132,
                lineHeight: 148,
                fontWeight: '900',
                color: THEME.accentForeground,
                fontVariant: ['tabular-nums'],
              }}>
              {Math.max(1, prerollLeft)}
            </AppText>
          ) : phase === 'done' ? (
            <View style={{ marginTop: 22, alignItems: 'center', gap: 14 }}>
              <Glyph name={GLYPH.checkmark} color={THEME.accent} size={56} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done, back to the session"
                onPress={onClose}
                style={({ pressed }) => ({
                  minHeight: 52,
                  paddingHorizontal: 40,
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
            <AppText
              style={{
                marginTop: 4,
                fontSize: 96,
                lineHeight: 112,
                fontWeight: '900',
                letterSpacing: -3,
                // The last three seconds of work turn the clock itself into the countdown, so a
                // muted phone across the room still shows the handover coming.
                color: finalCount ? THEME.accent : THEME.accentForeground,
                fontVariant: ['tabular-nums'],
              }}>
              {formatDuration(shown)}
            </AppText>
          )}

          {phase === 'done' ? null : (
            <>
              <AppText
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  letterSpacing: 0.4,
                  color: 'rgba(255,255,255,0.55)',
                  fontVariant: ['tabular-nums'],
                }}>
                Round {index + 1} / {blocks.length}
              </AppText>
              <AppText
                numberOfLines={1}
                style={{ marginTop: 2, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                {next
                  ? `Next: ${roundKindLabel(next.kind)} ${formatDuration(next.seconds)}`
                  : 'Last round'}
              </AppText>
            </>
          )}
        </View>

        {phase === 'done' ? null : (
          <UpcomingList blocks={blocks} index={index} />
        )}

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip this round"
              onPress={skip}
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
              <AppText
                style={{ fontSize: 15, fontWeight: '800', color: THEME.accentForeground }}>
                Skip
              </AppText>
            </Pressable>
          </View>
        )}
      </View>
    </View>
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
      contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
      {blocks.map((block, at) => {
        const current = at === index;
        const past = at < index;
        return (
          <View
            key={block.key}
            style={{
              paddingHorizontal: 11,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: current ? kindTint(block) : 'rgba(255,255,255,0.16)',
              backgroundColor: current ? kindTint(block) : 'transparent',
              opacity: past ? 0.32 : 1,
            }}>
            <AppText
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: current ? THEME.textPrimary : 'rgba(255,255,255,0.7)',
                fontVariant: ['tabular-nums'],
              }}>
              {shortKind(block)} {formatDuration(block.seconds)}
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

function kindTint(block: LiftPlayBlock | null): string {
  if (!block) {
    return THEME.accentForeground;
  }
  return block.work ? THEME.accent : THEME.accentBright;
}

function shortKind(block: LiftPlayBlock): string {
  if (block.kind === 'on') {
    return 'ON';
  }
  if (block.kind === 'off') {
    return 'OFF';
  }
  return roundKindLabel(block.kind);
}
