import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiftRecapCard } from '@/components/lift/LiftRecapCard';
import { OverloadSheet } from '@/components/lift/OverloadSheet';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import {
  useImportLiftSession,
  useLastSessionWithExercises,
  useLiftSession,
  useLiftUnit,
  useSaveLiftSession,
} from '@/hooks/useLift';
import { firstRouteParam } from '@/lib/challengeLoad';
import { fetchLiftSession } from '@/lib/lift/api';
import { applyOverload } from '@/lib/lift/overload';
import { buildRecap } from '@/lib/lift/recap';
import { shortDate } from '@/lib/lift/session';
import type { LiftOverloadPlan } from '@/lib/lift/types';
import { LIFT_START_HREF, liftSessionHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

/**
 * "Use this workout": copying a session off somebody's shared card.
 *
 * The structure comes across; the numbers do not, unless they ask. A friend's 225 must never become
 * your next log by accident, so "Empty numbers" is the default and every other option is a
 * deliberate tap.
 */

type NumberChoice = 'empty' | 'theirs' | 'overload';

export default function LiftImportScreen() {
  const params = useLocalSearchParams<{ fromSession?: string }>();
  const sourceId = firstRouteParam(params.fromSession);
  return <LiftImportInner key={sourceId || 'import'} sourceId={sourceId} />;
}

function LiftImportInner({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unit = useLiftUnit();
  const source = useLiftSession(sourceId);
  const importSession = useImportLiftSession();
  const save = useSaveLiftSession();

  const [choice, setChoice] = useState<NumberChoice>('empty');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = source.data ?? null;
  const recap = useMemo(() => (draft ? buildRecap(draft) : null), [draft]);

  // "Overload my last time" only makes sense when they have their own history for these lifts.
  const catalogIds = useMemo(
    () => (draft?.exercises ?? []).map((row) => row.exerciseId).filter((id): id is string => Boolean(id)),
    [draft],
  );
  const myLast = useLastSessionWithExercises(catalogIds);
  const canOverload = Boolean(myLast.data?.id);
  // Read in full so the Overload sheet can preview against sets they actually lifted.
  const myLastSession = useLiftSession(canOverload ? myLast.data?.id : null);

  useEffect(() => {
    if (!canOverload && choice === 'overload') {
      setChoice('empty');
    }
  }, [canOverload, choice]);

  const busy = importSession.isPending || save.isPending;

  async function start(plan?: LiftOverloadPlan) {
    if (!draft) {
      return;
    }
    setError(null);
    try {
      if (plan && myLast.data?.id) {
        // Their own numbers, bumped. A friend's card supplies structure, never a starting load.
        const mine = myLastSession.data ?? (await fetchLiftSession(myLast.data.id));
        if (!mine) {
          setError('Your last matching session is no longer there.');
          return;
        }
        const bumped = applyOverload(mine, plan);
        await save.mutateAsync({ draft: bumped });
        router.replace(liftSessionHref(bumped.id));
        return;
      }

      const copy = await importSession.mutateAsync({
        source: draft,
        numbers: choice === 'theirs' ? 'keep' : 'empty',
        unit,
      });
      await save.mutateAsync({ draft: copy });
      router.replace(liftSessionHref(copy.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set that up.');
    }
  }

  if (source.isLoading) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: true, title: 'Use this workout' }} />
        <MascotState kind="loading" title="Loading that workout…" />
      </Screen>
    );
  }

  // A session the viewer cannot see resolves to nothing, which is the same answer as one that was
  // deleted. Neither reveals that the id exists.
  if (!draft || !recap) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: true, title: 'Use this workout' }} />
        <MascotState
          kind="empty"
          title="This workout isn’t available"
          body="The person who shared it may have removed the post, or it isn’t shared with you."
          actionLabel="Start your own"
          onAction={() => router.replace(LIFT_START_HREF)}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <Stack.Screen options={{ headerShown: true, title: 'Use this workout' }} />
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 20 }}>
          <LiftRecapCard recap={recap} />

          <AppText
            style={{
              marginTop: 18,
              fontSize: 12,
              fontWeight: '800',
              letterSpacing: 0.7,
              color: THEME.textMuted,
            }}>
            STARTING NUMBERS
          </AppText>

          <View style={{ gap: 8, marginTop: 8 }}>
            <ChoiceRow
              label="Empty numbers"
              detail="Same exercises and sets. You type your own weights."
              selected={choice === 'empty'}
              onPress={() => setChoice('empty')}
            />
            <ChoiceRow
              label="Copy their numbers"
              detail="Starts at their loads. Edit anything before you lift it."
              selected={choice === 'theirs'}
              onPress={() => setChoice('theirs')}
            />
            {canOverload ? (
              <ChoiceRow
                label="Overload my last time"
                detail={`Builds on your ${myLast.data?.title} · ${shortDate(myLast.data?.performedAt ?? '')}`}
                selected={choice === 'overload'}
                onPress={() => setChoice('overload')}
              />
            ) : null}
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            gap: 8,
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
          <Button
            title={busy ? 'Setting it up…' : 'Start this workout'}
            loading={busy}
            onPress={() => {
              if (choice === 'overload') {
                setSheetOpen(true);
                return;
              }
              void start();
            }}
          />
        </View>
      </View>

      <OverloadSheet
        visible={sheetOpen}
        source={myLastSession.data ?? null}
        busy={busy}
        onClose={() => setSheetOpen(false)}
        onApply={(plan) => {
          setSheetOpen(false);
          void start(plan);
        }}
      />
    </Screen>
  );
}

function ChoiceRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
      }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? THEME.accent : THEME.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {selected ? (
          <View
            style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: THEME.accent }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
          {label}
        </AppText>
        <AppText style={{ fontSize: 12, color: THEME.textMuted }}>{detail}</AppText>
      </View>
    </Pressable>
  );
}
