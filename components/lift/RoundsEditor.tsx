import { Pressable, View } from 'react-native';

import { DurationField } from '@/components/lift/DurationField';
import { NumberField } from '@/components/lift/NumberField';
import { DoneCheck } from '@/components/lift/DoneCheck';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { formatDuration, splitDuration } from '@/lib/lift/duration';
import {
  addRound,
  clampIntensity,
  DEFAULT_ON_INTENSITY,
  duplicateLastPair,
  duplicateRound,
  EDITABLE_ROUND_KINDS,
  moveRound,
  removeRound,
  roundHasIntensity,
  roundKindShortLabel,
  roundSeconds,
  roundsSummary,
  updateRound,
} from '@/lib/lift/rounds';
import { toggleRoundComplete } from '@/lib/lift/complete';
import type { LiftRound, LiftRoundKind } from '@/lib/lift/types';
import { THEME } from '@/lib/theme';

/**
 * The rounds list on a cardio row.
 *
 * Eight rounds of Air Bike is one exercise repeated, so this lives inside that one card rather
 * than spawning eight rows in the section. Every round is a full editor line because the whole
 * point of intervals is that the third one is not the same as the first.
 */

/** How many rounds a saved session lists before collapsing into a count. */
const READ_ONLY_ROUNDS = 6;

type RoundsEditorProps = {
  rounds: readonly LiftRound[];
  readOnly?: boolean;
  onChange: (rounds: LiftRound[]) => void;
};

export function RoundsEditor({ rounds, readOnly, onChange }: RoundsEditorProps) {
  if (readOnly) {
    if (!rounds.length) {
      return null;
    }
    // A Tabata is sixteen rows. Listing every one on a saved session buries the exercises around
    // it, and the card header already states the count and the total.
    const shown = rounds.slice(0, READ_ONLY_ROUNDS);
    const hidden = rounds.length - shown.length;
    return (
      <View style={{ gap: 4 }}>
        {shown.map((round, index) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <KindPill kind={round.kind} />
            <AppText
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: THEME.textPrimary,
                fontVariant: ['tabular-nums'],
              }}>
              {formatDuration(roundSeconds(round))}
            </AppText>
            {round.intensity ? (
              <AppText style={{ fontSize: 12, color: THEME.textMuted }}>
                @ {round.intensity}
              </AppText>
            ) : null}
            <DoneCheck done={Boolean(round.completedAt)} label={`Round ${index + 1}`} disabled onToggle={() => {}} />
          </View>
        ))}
        {hidden > 0 ? (
          <AppText style={{ fontSize: 12, color: THEME.textMuted }}>+{hidden} more</AppText>
        ) : null}
      </View>
    );
  }

  // A cardio row with no rounds is a single block. It gets the one control that turns it into an
  // interval and nothing else, rather than an empty list with a header over it.
  if (!rounds.length) {
    return <TextAction label="+ Add round" onPress={() => onChange(addRound(rounds))} />;
  }

  const tail = rounds.slice(-2);
  const pairable = tail.length === 2 && tail[0].kind === 'on' && tail[1].kind === 'off';

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText
          style={{
            flex: 1,
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 0.6,
            color: THEME.textMuted,
          }}>
          ROUNDS
        </AppText>
        <AppText
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: THEME.textMuted,
            fontVariant: ['tabular-nums'],
          }}>
          {roundsSummary(rounds)}
        </AppText>
      </View>

      {rounds.map((round, index) => (
        <RoundRow
          key={index}
          round={round}
          index={index}
          total={rounds.length}
          onChange={(patch) => onChange(updateRound(rounds, index, patch))}
          onToggleComplete={() => onChange(toggleRoundComplete(rounds, index))}
          onDuplicate={() => onChange(duplicateRound(rounds, index))}
          onRemove={() => onChange(removeRound(rounds, index))}
          onMove={(direction) => onChange(moveRound(rounds, index, direction))}
        />
      ))}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextAction label="+ Add round" onPress={() => onChange(addRound(rounds))} />
        {/* Intervals are built in pairs, so "one more round" almost always means one more
            work-and-recover, not another work block bolted onto the last one. */}
        <TextAction
          label={pairable ? 'Duplicate last pair' : 'Duplicate last'}
          onPress={() => onChange(duplicateLastPair(rounds))}
        />
      </View>
    </View>
  );
}

function RoundRow({
  round,
  index,
  total,
  onChange,
  onToggleComplete,
  onDuplicate,
  onRemove,
  onMove,
}: {
  round: LiftRound;
  index: number;
  total: number;
  onChange: (patch: Partial<LiftRound>) => void;
  onToggleComplete: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const work = roundHasIntensity(round.kind);
  const label = `Round ${index + 1}`;

  return (
    <View
      style={{
        gap: 8,
        padding: 9,
        borderRadius: 12,
        borderWidth: 1,
        // Work rounds carry the accent so the list reads as effort-then-recovery at a glance
        // instead of as a wall of identical stepper cards.
        borderColor: work ? THEME.accentBright : THEME.border,
        backgroundColor: work ? THEME.surface : THEME.background,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AppText
          style={{
            width: 20,
            fontSize: 12,
            fontWeight: '800',
            color: THEME.textMuted,
            fontVariant: ['tabular-nums'],
          }}>
          {index + 1}
        </AppText>
        {/* Five kinds do not fit beside the row actions on a phone, so they wrap rather than
            squeezing every label down to an initial. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 4,
            flex: 1,
            minWidth: 0,
          }}>
          {EDITABLE_ROUND_KINDS.map((kind) => {
            const on = round.kind === kind;
            return (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${roundKindShortLabel(kind)}`}
                accessibilityState={{ selected: on }}
                onPress={() => onChange({ kind })}
                style={{
                  minHeight: 30,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? kindColor(kind) : THEME.background,
                  borderWidth: 1,
                  borderColor: on ? kindColor(kind) : THEME.border,
                }}>
                <AppText
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: on ? THEME.accentForeground : THEME.textMuted,
                  }}>
                  {roundKindShortLabel(kind)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <RoundAction
          glyph={GLYPH.chevronUp}
          label={`Move ${label} up`}
          disabled={index === 0}
          onPress={() => onMove(-1)}
        />
        <RoundAction
          glyph={GLYPH.chevronDown}
          label={`Move ${label} down`}
          disabled={index === total - 1}
          onPress={() => onMove(1)}
        />
        <RoundAction glyph={GLYPH.plus} label={`Duplicate ${label}`} onPress={onDuplicate} />
        {/* A list with no rounds left has an Interval type and nothing to count down. */}
        <RoundAction
          glyph={GLYPH.trash}
          label={`Delete ${label}`}
          disabled={total <= 1}
          onPress={onRemove}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 2, minWidth: 0 }}>
          <DurationField
            seconds={roundSeconds(round)}
            label={`${label} ${roundKindShortLabel(round.kind)}`}
            onChange={(seconds) => onChange(splitDuration(seconds))}
          />
        </View>
        {work ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <NumberField
              value={round.intensity ?? null}
              label={`${label} intensity out of 10`}
              placeholder="8"
              onCommit={(text) => {
                const typed = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
                onChange({
                  intensity: clampIntensity(Number.isFinite(typed) ? typed : DEFAULT_ON_INTENSITY),
                });
              }}
              onStep={(direction) =>
                onChange({
                  intensity: clampIntensity((round.intensity ?? DEFAULT_ON_INTENSITY) + direction),
                })
              }
            />
            <AppText
              style={{
                marginTop: 3,
                fontSize: 10,
                fontWeight: '800',
                letterSpacing: 0.6,
                textAlign: 'center',
                color: THEME.textMuted,
              }}>
              INTENSITY
            </AppText>
          </View>
        ) : (
          // Recovery has nothing to aim at, so the slot stays empty rather than showing a
          // disabled stepper the eye has to skip past on every other row.
          <View style={{ flex: 1, minWidth: 0 }} />
        )}
        <DoneCheck
          done={Boolean(round.completedAt)}
          label={label}
          onToggle={onToggleComplete}
        />
      </View>
    </View>
  );
}

function KindPill({ kind }: { kind: LiftRoundKind }) {
  return (
    <View
      style={{
        minWidth: 42,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        alignItems: 'center',
        backgroundColor: kindColor(kind),
      }}>
      <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accentForeground }}>
        {roundKindShortLabel(kind)}
      </AppText>
    </View>
  );
}

function RoundAction({
  glyph,
  label,
  disabled,
  onPress,
}: {
  glyph: Parameters<typeof Glyph>[0]['name'];
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 28,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.25 : pressed ? 0.6 : 1,
      })}>
      <Glyph name={glyph} color={THEME.textMuted} size={13} />
    </Pressable>
  );
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.background,
        opacity: pressed ? 0.7 : 1,
      })}>
      <AppText style={{ fontSize: 13, fontWeight: '800', color: THEME.textPrimary }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function kindColor(kind: LiftRoundKind): string {
  if (kind === 'on') {
    return THEME.accent;
  }
  return kind === 'off' ? THEME.textPrimary : THEME.textMuted;
}

