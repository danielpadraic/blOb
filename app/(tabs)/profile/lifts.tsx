import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverloadSheet } from '@/components/lift/OverloadSheet';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useLiftHistory, useSaveLiftSession } from '@/hooks/useLift';
import { fetchLiftSession } from '@/lib/lift/api';
import { muscleSummary } from '@/lib/lift/muscles';
import { applyOverload, overloadChipLabel } from '@/lib/lift/overload';
import { repeatSession, shortDate } from '@/lib/lift/session';
import type { LiftOverloadPlan, LiftSessionDraft, LiftSessionSummary } from '@/lib/lift/types';
import { LIFT_START_HREF, liftSessionHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

/**
 * You → Lifts. Reverse-chronological, owner-only. Not on the public profile and not in body metrics.
 */
export default function LiftsHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch } = useLiftHistory();
  const save = useSaveLiftSession();

  const [menuFor, setMenuFor] = useState<LiftSessionSummary | null>(null);
  const [overloadFor, setOverloadFor] = useState<LiftSessionDraft | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  // An abandoned empty session is noise, not history.
  const rows = (data ?? []).filter((row) => row.exerciseCount > 0 || row.completedAt);

  /** "Start this again" and "Overload and start" are the same copy; the plan is what differs. */
  async function startAgain(
    target: LiftSessionSummary | LiftSessionDraft | null,
    plan?: LiftOverloadPlan,
  ) {
    if (!target) {
      return;
    }
    setMenuError(null);
    try {
      const source = await fetchLiftSession(target.id);
      if (!source) {
        setMenuError('That session is no longer there.');
        return;
      }
      const draft = plan ? applyOverload(source, plan) : repeatSession(source);
      await save.mutateAsync({ draft });
      setMenuFor(null);
      setOverloadFor(null);
      router.push(liftSessionHref(draft.id));
    } catch (caught) {
      setMenuError(caught instanceof Error ? caught.message : 'Could not copy that lift.');
    }
  }

  /** The sheet previews against real sets, so the session is read before it opens. */
  async function openOverload(target: LiftSessionSummary | null) {
    if (!target) {
      return;
    }
    setMenuError(null);
    try {
      const source = await fetchLiftSession(target.id);
      if (!source) {
        setMenuError('That session is no longer there.');
        return;
      }
      setMenuFor(null);
      setOverloadFor(source);
    } catch (caught) {
      setMenuError(caught instanceof Error ? caught.message : 'Could not open that lift.');
    }
  }

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
              <LiftList
                rows={rows}
                onOpen={(id) => router.push(liftSessionHref(id))}
                onMenu={(session) => setMenuFor(session)}
              />
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

      <LiftHistoryMenu
        session={menuFor}
        busy={save.isPending}
        error={menuError}
        onClose={() => {
          setMenuFor(null);
          setMenuError(null);
        }}
        onStartAgain={() => void startAgain(menuFor)}
        onOverload={() => void openOverload(menuFor)}
        onShare={() => {
          const id = menuFor?.id;
          setMenuFor(null);
          if (id) {
            router.push(liftSessionHref(id));
          }
        }}
      />

      <OverloadSheet
        visible={Boolean(overloadFor)}
        source={overloadFor}
        busy={save.isPending}
        onClose={() => setOverloadFor(null)}
        onApply={(plan) => void startAgain(overloadFor, plan)}
      />
    </Screen>
  );
}

/**
 * Row overflow: repeat the session as it was, repeat it heavier, or share the card.
 *
 * Share opens the saved session rather than publishing from here — the Done sheet is where a
 * caption and an audience get chosen, and there should only be one of those.
 */
function LiftHistoryMenu({
  session,
  busy,
  error,
  onClose,
  onStartAgain,
  onOverload,
  onShare,
}: {
  session: LiftSessionSummary | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onStartAgain: () => void;
  onOverload: () => void;
  onShare: () => void;
}) {
  if (!session) {
    return null;
  }
  return (
    <ChromeOverlay visible onClose={busy ? undefined : onClose} align="end" zIndex={135}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingHorizontal: 18,
          paddingTop: 16,
          paddingBottom: 24,
        }}>
        <AppText
          numberOfLines={1}
          style={{ fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>
          {session.title}
        </AppText>
        <AppText style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 10 }}>
          {shortDate(session.performedAt)} · {session.setCount}{' '}
          {session.setCount === 1 ? 'set' : 'sets'}
        </AppText>

        {error ? (
          <AppText style={{ fontSize: 13, fontWeight: '600', color: THEME.danger, marginBottom: 8 }}>
            {error}
          </AppText>
        ) : null}

        <MenuRow
          icon={GLYPH.lift}
          label="Start this again"
          detail="Same exercises and the numbers you used last time."
          disabled={busy}
          onPress={onStartAgain}
        />
        <MenuRow
          icon={GLYPH.trendUp}
          label="Overload and start"
          detail="Same session, bumped by whatever you choose."
          disabled={busy}
          onPress={onOverload}
        />
        {session.completedAt ? (
          <MenuRow
            icon={GLYPH.share}
            label="Share"
            detail={session.sharedPostId ? 'Already shared — post it again.' : 'Post the recap card.'}
            disabled={busy}
            onPress={onShare}
          />
        ) : null}
      </View>
    </ChromeOverlay>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  disabled,
  onPress,
}: {
  icon: GlyphId;
  label: string;
  detail: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: pressed ? THEME.accentSoft : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: THEME.accentSoft,
        }}>
        <Glyph name={icon} color={THEME.accent} size={15} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
          {label}
        </AppText>
        <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
          {detail}
        </AppText>
      </View>
    </Pressable>
  );
}

function LiftList({
  rows,
  onOpen,
  onMenu,
}: {
  rows: LiftSessionSummary[];
  onOpen: (id: string) => void;
  onMenu: (session: LiftSessionSummary) => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
      {rows.map((row) => (
        <LiftHistoryCard
          key={row.id}
          session={row}
          onPress={() => onOpen(row.id)}
          onMenu={() => onMenu(row)}
        />
      ))}
    </ScrollView>
  );
}

export function LiftHistoryCard({
  session,
  onPress,
  onMenu,
}: {
  session: LiftSessionSummary;
  onPress: () => void;
  onMenu?: () => void;
}) {
  const open = !session.completedAt;
  const chip = overloadChipLabel(session.overloadSummary);
  return (
    // The overflow button is a sibling, not a child: nesting it inside the card's Pressable makes
    // one tap fire both handlers on Web.
    <View
      style={{
        borderRadius: 18,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        ...themeShadow('card'),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${session.title}`}
          onPress={onPress}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            paddingLeft: 14,
            paddingRight: 6,
            paddingTop: 14,
            paddingBottom: onMenu ? 6 : 14,
            borderRadius: 18,
            backgroundColor: pressed ? THEME.accentSoft : 'transparent',
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
            {chip ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  height: 22,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: THEME.accent,
                }}>
                <AppText
                  style={{ fontSize: 11, fontWeight: '800', color: THEME.accentForeground }}>
                  {chip}
                </AppText>
              </View>
            ) : null}
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
                <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accent }}>
                  Open
                </AppText>
              </View>
            ) : null}
            <Glyph name={GLYPH.chevronRight} color={THEME.textMuted} size={14} />
          </View>
        </Pressable>
        {onMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More options for ${session.title}`}
            hitSlop={6}
            onPress={onMenu}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              marginRight: 4,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? THEME.accentSoft : 'transparent',
            })}>
            <Glyph name={GLYPH.more} color={THEME.textMuted} size={16} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        {session.preview.length ? (
          <View style={{ gap: 2 }}>
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
      </View>
    </View>
  );
}
