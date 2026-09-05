import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useLiftHistory } from '@/hooks/useLift';
import { muscleSummary } from '@/lib/lift/muscles';
import { shortDate } from '@/lib/lift/session';
import type { LiftSessionSummary } from '@/lib/lift/types';
import { LIFT_START_HREF, liftSessionHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

/**
 * You → Lifts. Reverse-chronological, owner-only. Not on the public profile and not in body metrics.
 */
export default function LiftsHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch } = useLiftHistory();

  // An abandoned empty session is noise, not history.
  const rows = (data ?? []).filter((row) => row.exerciseCount > 0 || row.completedAt);

  if (isLoading) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState kind="loading" title="Loading your lifts…" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState
          kind="error"
          title="Couldn’t load your lifts"
          body={error instanceof Error ? error.message : 'Try again in a moment.'}
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {rows.length === 0 ? (
          <MascotState
            kind="empty"
            title="No lifts yet"
            body="Pick your muscles, log your sets, and they land here."
          />
        ) : (
          <View style={{ flex: 1, minHeight: 0 }}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: 10,
              }}>
              <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
                {rows.length} {rows.length === 1 ? 'session' : 'sessions'} · only you can see these
              </AppText>
            </View>
            <View style={{ flex: 1, minHeight: 0 }}>
              <LiftList rows={rows} onOpen={(id) => router.push(liftSessionHref(id))} />
            </View>
          </View>
        )}

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            backgroundColor: THEME.surface,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            paddingBottom: tabBarLift(insets.bottom, 'sticky') + 12,
            ...themeShadow('bar'),
          }}>
          <Button title="Start lift" onPress={() => router.push(LIFT_START_HREF)} />
        </View>
      </View>
    </Screen>
  );
}

function LiftList({
  rows,
  onOpen,
}: {
  rows: LiftSessionSummary[];
  onOpen: (id: string) => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
      {rows.map((row) => (
        <LiftHistoryCard key={row.id} session={row} onPress={() => onOpen(row.id)} />
      ))}
    </ScrollView>
  );
}

export function LiftHistoryCard({
  session,
  onPress,
}: {
  session: LiftSessionSummary;
  onPress: () => void;
}) {
  const open = !session.completedAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${session.title}`}
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 14,
        borderRadius: 18,
        backgroundColor: pressed ? THEME.accentSoft : THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        ...themeShadow('card'),
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText
            numberOfLines={1}
            style={{ fontSize: 16, fontWeight: '800', color: THEME.textPrimary }}>
            {session.title}
          </AppText>
          <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
            {[
              muscleSummary(session.muscleKeys),
              shortDate(session.performedAt),
              `${session.setCount} ${session.setCount === 1 ? 'set' : 'sets'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
        {open ? (
          <View
            style={{
              paddingHorizontal: 8,
              height: 22,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: THEME.accentSoft,
            }}>
            <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accent }}>Open</AppText>
          </View>
        ) : null}
        <Glyph name={GLYPH.chevronRight} color={THEME.textMuted} size={14} />
      </View>
      {session.preview.length ? (
        <View style={{ marginTop: 8, gap: 2 }}>
          {session.preview.map((line) => (
            <AppText
              key={line}
              numberOfLines={1}
              style={{ fontSize: 13, color: THEME.textPrimary }}>
              {line}
            </AppText>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
