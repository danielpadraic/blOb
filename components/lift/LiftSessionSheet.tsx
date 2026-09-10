import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useImportLiftSession, useLiftSession, useLiftUnit, useSaveLiftSession } from '@/hooks/useLift';
import { copy } from '@/lib/copy';
import { formatMassLabel } from '@/lib/lift/massUnit';
import { buildRecap } from '@/lib/lift/recap';
import { formatDuration, formatLiftNumber, sessionTitle, shortDate, timedRowLabel } from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftSessionDraft } from '@/lib/lift/types';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

type LiftSessionSheetProps = {
  visible: boolean;
  sessionId: string | null;
  /** Frozen copy on the post — used when the live session is gone or unreadable. */
  snapshot?: LiftSessionDraft | null;
  authorId?: string | null;
  authorName?: string | null;
  onClose: () => void;
  onAdded?: () => void;
};

/**
 * Read-only view of a shared lift. Viewers can deep-copy it. Authors open the real session instead.
 */
export function LiftSessionSheet({
  visible,
  sessionId,
  snapshot,
  authorId,
  authorName,
  onClose,
  onAdded,
}: LiftSessionSheetProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const unit = useLiftUnit();
  const live = useLiftSession(visible ? sessionId : null);
  const importSession = useImportLiftSession();
  const save = useSaveLiftSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const draft = live.data ?? snapshot ?? null;
  const recap = useMemo(() => (draft ? buildRecap(draft, 99) : null), [draft]);
  const mine = Boolean(user?.id && authorId && user.id === authorId);
  const credit = draft?.ownerName?.trim() || authorName?.trim() || null;

  async function addCopy() {
    if (!draft || mine) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const copyDraft = await importSession.mutateAsync({
        source: {
          ...draft,
          ownerUserId: draft.ownerUserId ?? authorId ?? null,
          ownerName: credit,
        },
        numbers: 'keep',
        unit: draft.unit ?? unit,
      });
      await save.mutateAsync({ draft: copyDraft });
      onAdded?.();
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught) || 'Could not add that session.');
    } finally {
      setBusy(false);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <ChromeOverlay visible onClose={busy ? undefined : onClose} align="end" zIndex={150}>
      <View
        style={{
          maxHeight: '88%',
          backgroundColor: THEME.surface,
          borderTopLeftRadius: THEME.radius,
          borderTopRightRadius: THEME.radius,
          ...themeShadow('bar'),
        }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
          <AppText style={{ fontSize: 18, fontWeight: '800', color: THEME.textPrimary }}>
            {recap?.title || sessionTitle(draft) || 'Lift'}
          </AppText>
          {credit && !mine ? (
            <AppText style={{ marginTop: 4, fontSize: 13, fontWeight: '700', color: THEME.accent }}>
              {copy('lift.createdBy', 'gentle', { name: credit })}
            </AppText>
          ) : null}
          {recap ? (
            <AppText style={{ marginTop: 4, fontSize: 13, color: THEME.textMuted }}>
              {shortDate(draft?.performedAt ?? recap.date)} · {recap.exerciseCount}{' '}
              {recap.exerciseCount === 1 ? 'exercise' : 'exercises'} · {recap.setCount}{' '}
              {recap.setCount === 1 ? 'set' : 'sets'}
            </AppText>
          ) : null}
        </View>

        <ScrollView
          style={{ maxHeight: 420 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 14 }}
          showsVerticalScrollIndicator={false}>
          {live.isLoading && !snapshot ? (
            <AppText style={{ fontSize: 14, color: THEME.textMuted }}>Loading that workout…</AppText>
          ) : !draft || !recap ? (
            <AppText style={{ fontSize: 14, color: THEME.textMuted }}>
              {copy('lift.sessionUnavailable')}
            </AppText>
          ) : (
            <>
              {draft.exercises.map((exercise) => (
                <ExerciseBlock key={exercise.key} exercise={exercise} unit={draft.unit} />
              ))}
              {recap.volumeLine ? (
                <AppText
                  style={{
                    fontSize: 15,
                    fontWeight: '800',
                    color: THEME.textPrimary,
                    fontVariant: ['tabular-nums'],
                  }}>
                  {recap.volumeLine}
                </AppText>
              ) : null}
            </>
          )}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: tabBarLift(insets.bottom, 'overlay'),
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            backgroundColor: THEME.surface,
          }}>
          {error ? (
            <AppText style={{ fontSize: 13, fontWeight: '600', color: THEME.danger }}>{error}</AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!mine && draft ? (
              <View style={{ flex: 1 }}>
                <Button
                  title={busy ? 'Setting it up…' : copy('lift.addThisSession')}
                  loading={busy}
                  onPress={() => void addCopy()}
                />
              </View>
            ) : null}
            <View style={{ flex: mine || !draft ? 1 : undefined, minWidth: mine || !draft ? undefined : 96 }}>
              <Button title={copy('lift.close')} variant="outline" disabled={busy} onPress={onClose} />
            </View>
          </View>
        </View>
      </View>
    </ChromeOverlay>
  );
}

function ExerciseBlock({
  exercise,
  unit,
}: {
  exercise: LiftExerciseDraft;
  unit: LiftSessionDraft['unit'];
}) {
  const timed = exercise.kind === 'cardio' || exercise.kind === 'rest';
  return (
    <View style={{ gap: 4 }}>
      <AppText style={{ fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
        {timed ? timedRowLabel(exercise) : exercise.name}
      </AppText>
      {timed ? (
        <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
          {exercise.kind === 'cardio'
            ? [exercise.cardioType, formatDuration(exercise.durationSeconds ?? 0)].filter(Boolean).join(' · ')
            : formatDuration(exercise.durationSeconds ?? 0)}
        </AppText>
      ) : (
        exercise.sets.map((set, index) => (
          <AppText
            key={set.key || `${exercise.key}-${index}`}
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: THEME.textMuted,
              fontVariant: ['tabular-nums'],
            }}>
            {set.kind === 'warmup' ? 'W' : index + 1}
            {'  '}
            {set.weight != null
              ? formatMassLabel(set.weight, unit, formatLiftNumber(set.weight))
              : '—'}
            {'  '}
            {set.reps != null ? `${formatLiftNumber(set.reps)} reps` : '—'}
          </AppText>
        ))
      )}
    </View>
  );
}
