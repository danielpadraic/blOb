import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import {
  useLastSessionForMuscles,
  useLiftHistory,
  useLiftUnit,
  useSaveLiftSession,
} from '@/hooks/useLift';
import { fetchLiftSession } from '@/lib/lift/api';
import { MUSCLE_KEYS, muscleLabel, muscleSummary, type MuscleKey } from '@/lib/lift/muscles';
import { newSessionDraft, repeatSession, shortDate } from '@/lib/lift/session';
import { LIFTS_HISTORY_HREF, liftSessionHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

/**
 * Start a lift: pick muscles, then either repeat the last session that covered them or start new.
 *
 * Both buttons create the session row up front, so a session survives a reload mid-workout and the
 * user never loses sets to a dropped connection.
 */
export default function LiftStartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unit = useLiftUnit();
  const history = useLiftHistory();
  const save = useSaveLiftSession();
  const [selected, setSelected] = useState<MuscleKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const last = useLastSessionForMuscles(selected);

  const picked = selected.length > 0;
  const summary = muscleSummary(selected);
  const busy = save.isPending;

  function toggle(key: MuscleKey) {
    setError(null);
    setSelected((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  async function startNew() {
    setError(null);
    try {
      const draft = newSessionDraft({ muscleKeys: selected, unit });
      await save.mutateAsync({ draft });
      router.replace(liftSessionHref(draft.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start that lift.');
    }
  }

  async function repeatLast() {
    setError(null);
    const sourceId = last.data?.id;
    if (!sourceId) {
      return;
    }
    try {
      const source = await fetchLiftSession(sourceId);
      if (!source) {
        setError('That session is no longer there. Start new instead.');
        return;
      }
      const draft = repeatSession(source);
      await save.mutateAsync({ draft });
      router.replace(liftSessionHref(draft.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not copy that lift.');
    }
  }

  const openSessions = (history.data ?? []).filter(
    (row) => !row.completedAt && row.exerciseCount > 0,
  );

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppText
              style={{
                flex: 1,
                fontSize: 24,
                fontWeight: '800',
                color: THEME.textPrimary,
              }}>
              What are you training?
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your lifts"
              hitSlop={8}
              onPress={() => router.push(LIFTS_HISTORY_HREF)}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: THEME.surface,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}>
              <Glyph name={GLYPH.clock} color={THEME.textPrimary} size={13} />
              <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.textPrimary }}>
                History
              </AppText>
            </Pressable>
          </View>
          <AppText style={{ marginTop: 4, fontSize: 14, color: THEME.textMuted }}>
            Pick as many as you like. Each one becomes a section you can collapse.
          </AppText>
        </View>

        {openSessions.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Resume ${openSessions[0].title}`}
            onPress={() => router.push(liftSessionHref(openSessions[0].id))}
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: 16,
              backgroundColor: THEME.accentSoft,
              borderWidth: 1,
              borderColor: THEME.accentBright,
            }}>
            <Glyph name={GLYPH.lift} color={THEME.accent} size={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: '800', color: THEME.accent }}>
                Pick up {openSessions[0].title}
              </AppText>
              <AppText style={{ fontSize: 12, color: THEME.textMuted }}>
                Still open · {openSessions[0].setCount} sets logged
              </AppText>
            </View>
            <Glyph name={GLYPH.chevronRight} color={THEME.accent} size={14} />
          </Pressable>
        ) : null}

        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
            }}>
            {MUSCLE_KEYS.map((key) => {
              const on = selected.includes(key);
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={muscleLabel(key)}
                  accessibilityState={{ selected: on }}
                  onPress={() => toggle(key)}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? THEME.accent : THEME.surface,
                    borderWidth: 1,
                    borderColor: on ? THEME.accent : THEME.border,
                  }}>
                  <AppText
                    style={{
                      fontSize: 15,
                      fontWeight: '700',
                      color: on ? THEME.accentForeground : THEME.textPrimary,
                    }}>
                    {muscleLabel(key)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            gap: 10,
            backgroundColor: THEME.surface,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            paddingBottom: tabBarLift(insets.bottom, 'sticky') + 12,
            ...themeShadow('bar'),
          }}>
          {error ? (
            <AppText style={{ fontSize: 13, fontWeight: '600', color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}

          {picked ? (
            <>
              {last.data ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use last ${summary} session`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => void repeatLast()}
                  style={({ pressed }) => ({
                    minHeight: 56,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: THEME.accent,
                    backgroundColor: pressed ? THEME.accentSoft : THEME.surface,
                    justifyContent: 'center',
                    opacity: busy ? 0.5 : 1,
                  })}>
                  <AppText style={{ fontSize: 15, fontWeight: '700', color: THEME.accent }}>
                    Use last {summary} session
                  </AppText>
                  <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
                    {shortDate(last.data.performedAt)} · {last.data.exerciseCount} exercises ·{' '}
                    {last.data.setCount} sets
                  </AppText>
                </Pressable>
              ) : null}
              <Button
                title={busy ? 'Starting…' : 'Start new'}
                loading={busy}
                onPress={() => void startNew()}
              />
            </>
          ) : (
            <AppText
              style={{
                fontSize: 14,
                color: THEME.textMuted,
                textAlign: 'center',
                paddingVertical: 14,
              }}>
              Pick at least one muscle to begin.
            </AppText>
          )}
        </View>
      </View>
    </Screen>
  );
}
