import { Pressable, ScrollView, View } from 'react-native';

import { DurationField } from '@/components/lift/DurationField';
import { NumberField } from '@/components/lift/NumberField';
import { RoundsEditor } from '@/components/lift/RoundsEditor';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { canPlay, cardioRowSeconds } from '@/lib/lift/rounds';
import {
  CARDIO_TYPES,
  cardioTypeLabel,
  formatDuration,
  timedRowLabel,
} from '@/lib/lift/session';
import type { LiftCardioType, LiftExerciseDraft, LiftRound } from '@/lib/lift/types';
import { THEME, themeShadow } from '@/lib/theme';

/**
 * A cardio or rest row inside a muscle section.
 *
 * These sit in the running order next to the exercises, which is the point: a 45 second rest
 * between two bench sets is part of the session, not a note about it.
 */

type TimedRowCardProps = {
  row: LiftExerciseDraft;
  readOnly?: boolean;
  onChangeDuration: (seconds: number) => void;
  onChangeType: (type: LiftCardioType) => void;
  onChangeIntensity: (value: number) => void;
  onChangeMethod: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  onChangeRounds?: (rounds: LiftRound[]) => void;
  onPlay?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

export function TimedRowCard({
  row,
  readOnly,
  onChangeDuration,
  onChangeType,
  onChangeIntensity,
  onChangeMethod,
  onRemove,
  onDuplicate,
  onMove,
  onChangeRounds,
  onPlay,
  canMoveUp,
  canMoveDown,
}: TimedRowCardProps) {
  const rest = row.kind === 'rest';
  const title = timedRowLabel(row);
  const rounds = row.rounds ?? [];
  const interval = !rest && row.cardioType === 'interval';
  // An interval's time lives entirely in its rounds, so the single duration field would be a
  // second, contradictory answer to "how long is this".
  const showDuration = !interval;
  const playable = !rest && canPlay(row);

  if (readOnly) {
    return (
      <View style={cardStyle(rest)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Glyph
            name={rest ? GLYPH.clock : GLYPH.anyExercise}
            color={rest ? THEME.textMuted : THEME.accent}
            size={15}
          />
          <AppText
            numberOfLines={1}
            style={{ flex: 1, fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
            {title}
          </AppText>
          <AppText style={{ fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
            {formatDuration(rest ? row.durationSeconds : cardioRowSeconds(row))}
          </AppText>
        </View>
        {rest ? null : (
          <AppText style={{ marginTop: 2, fontSize: 12, color: THEME.textMuted }}>
            {[
              cardioTypeLabel(row.cardioType),
              rounds.length ? `${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}` : '',
              // Interval effort is per round, so one number for the row would be a fiction.
              !interval && row.intensity ? `Intensity ${row.intensity}/10` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        )}
        {rounds.length ? <RoundsEditor rounds={rounds} readOnly onChange={() => {}} /> : null}
      </View>
    );
  }

  return (
    <View style={cardStyle(rest)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Glyph
          name={rest ? GLYPH.clock : GLYPH.anyExercise}
          color={rest ? THEME.textMuted : THEME.accent}
          size={15}
        />
        {rest ? (
          <AppText
            numberOfLines={1}
            style={{ flex: 1, fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
            Rest
          </AppText>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change cardio type, currently ${title}`}
            onPress={onChangeMethod}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              justifyContent: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              opacity: pressed ? 0.6 : 1,
            })}>
            <AppText
              numberOfLines={1}
              style={{ flex: 1, fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
              {title}
            </AppText>
            <Glyph name={GLYPH.chevronDown} color={THEME.textMuted} size={12} />
          </Pressable>
        )}
        {/* Duplicating a rest is how a set of intervals gets built: log one 45s rest, then drop a
            copy between every pair of working sets. */}
        <RowAction
          glyph={GLYPH.plus}
          label={`Duplicate ${title}`}
          onPress={onDuplicate}
        />
        <RowAction
          glyph={GLYPH.chevronUp}
          label={`Move ${title} up`}
          disabled={!canMoveUp}
          onPress={() => onMove(-1)}
        />
        <RowAction
          glyph={GLYPH.chevronDown}
          label={`Move ${title} down`}
          disabled={!canMoveDown}
          onPress={() => onMove(1)}
        />
        <RowAction glyph={GLYPH.close} label={`Remove ${title}`} onPress={onRemove} />
      </View>

      {rest ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {CARDIO_TYPES.map((type) => {
            const on = row.cardioType === type;
            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityLabel={cardioTypeLabel(type)}
                accessibilityState={{ selected: on }}
                onPress={() => onChangeType(type)}
                style={{
                  minHeight: 34,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? THEME.accent : THEME.background,
                  borderWidth: 1,
                  borderColor: on ? THEME.accent : THEME.border,
                }}>
                <AppText
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: on ? THEME.accentForeground : THEME.textPrimary,
                  }}>
                  {cardioTypeLabel(type)}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {showDuration ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: rest ? 1 : 2, minWidth: 0 }}>
            <DurationField
              seconds={row.durationSeconds}
              onChange={onChangeDuration}
              label={rest ? 'Rest' : 'Cardio'}
            />
          </View>
          {rest ? null : (
            <View style={{ flex: 1, minWidth: 0 }}>
              <NumberField
                value={row.intensity ?? null}
                label="Intensity out of 10"
                placeholder="5"
                onCommit={(text) => {
                  const typed = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
                  onChangeIntensity(clampIntensity(Number.isFinite(typed) ? typed : 5));
                }}
                onStep={(direction) => onChangeIntensity(clampIntensity((row.intensity ?? 5) + direction))}
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
          )}
        </View>
      ) : null}

      {/* Interval shows the rounds list instead of a single clock. The other types keep their one
          block, and any rounds someone adds play after it — which is how a warm-up picks up two
          finishers without turning into an interval workout. */}
      {rest || !onChangeRounds ? null : (
        <RoundsEditor rounds={rounds} onChange={onChangeRounds} />
      )}

      {playable && onPlay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${title} timer`}
          onPress={onPlay}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            borderRadius: 12,
            backgroundColor: THEME.textPrimary,
            opacity: pressed ? 0.8 : 1,
          })}>
          <Glyph name={GLYPH.play} color={THEME.accentForeground} size={16} />
          <AppText style={{ fontSize: 14, fontWeight: '800', color: THEME.accentForeground }}>
            Play
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A compact icon button in the timed row's header strip. */
function RowAction({
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
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 34,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
      })}>
      <Glyph name={glyph} color={THEME.textMuted} size={14} />
    </Pressable>
  );
}

/** Whole numbers only, and never outside the scale the label promises. */
function clampIntensity(value: number): number {
  return Math.min(Math.max(Math.round(value), 1), 10);
}

function cardStyle(rest: boolean) {
  return {
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    // A rest is a gap in the work, so it reads quieter than the things around it.
    borderColor: rest ? THEME.border : THEME.accentBright,
    backgroundColor: rest ? THEME.background : THEME.surface,
    ...(rest ? null : themeShadow('card')),
  };
}
