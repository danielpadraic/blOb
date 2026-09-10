import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiftCompletedCard } from '@/components/lift/LiftCompletedCard';
import { LiftFilterSheet } from '@/components/lift/LiftFilterSheet';
import { LiftShareSheet, type LiftShareChoice } from '@/components/lift/LiftShareSheet';
import { OverloadSheet } from '@/components/lift/OverloadSheet';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useContextualTour } from '@/components/tour/useContextualTour';
import { useAuth } from '@/hooks/useAuth';
import { LIFT_HISTORY_STEPS } from '@/lib/contextualTour';
import {
  useAttachLiftToCheckin,
  useDeleteLiftSession,
  useLiftHistory,
  useLiftingChallenges,
  useSaveLiftSession,
  useSetLiftSessionFavorite,
  useShareLiftSession,
} from '@/hooks/useLift';
import { useCreatePost } from '@/hooks/useFeed';
import {
  useCreateGroupConversation,
  useGetOrCreateConversation,
  useSendMessage,
} from '@/hooks/useSocial';
import { fetchLiftSession } from '@/lib/lift/api';
import {
  fetchChallengeShareLocks,
  linkSessionToPost,
  sendLiftToRecipients,
} from '@/lib/lift/share';
import type { ComposeInput } from '@/lib/types';
import { challengeDetailHref, circleDetailHref } from '@/lib/routes';
import {
  activeFilterCount,
  EMPTY_LIFT_FILTER,
  filterLiftHistory,
  isFilterActive,
  musclesInHistory,
  type LiftHistoryFilter,
} from '@/lib/lift/historyFilter';
import {
  buildCompletedCardFromSummary,
  defaultHistoryTab,
  filterHistoryTab,
  formatWeightMoved,
  isCompletedStatus,
} from '@/lib/lift/complete';
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
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useLiftHistory();
  const save = useSaveLiftSession();
  const favorite = useSetLiftSessionFavorite();
  const remove = useDeleteLiftSession();
  const share = useShareLiftSession();
  const attach = useAttachLiftToCheckin();
  const liftingChallenges = useLiftingChallenges();
  const startChat = useGetOrCreateConversation();
  const startGroup = useCreateGroupConversation();
  const createPost = useCreatePost();
  const sendMessage = useSendMessage();
  const [lockedChallengeIds, setLockedChallengeIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<LiftHistoryFilter>(EMPTY_LIFT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [tab, setTab] = useState<'favorites' | 'drafts' | 'completed' | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [menuFor, setMenuFor] = useState<LiftSessionSummary | null>(null);
  const [overloadFor, setOverloadFor] = useState<LiftSessionDraft | null>(null);
  const [shareFor, setShareFor] = useState<LiftSessionDraft | null>(null);
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  // An abandoned empty session is noise, not history.
  const all = (data ?? []).filter((row) => row.exerciseCount > 0 || row.completedAt);
  const resolvedTab = tab ?? defaultHistoryTab(all);
  const tabbed = useMemo(() => filterHistoryTab(all, resolvedTab), [all, resolvedTab]);
  const rows = useMemo(() => filterLiftHistory(tabbed, filter), [tabbed, filter]);
  const filterMuscles = useMemo(() => musclesInHistory(tabbed), [tabbed]);
  const filtering = isFilterActive(filter);
  const completedWeight = tabbed.reduce((total, row) => total + (row.weightMoved ?? 0), 0);
  const weightUnit = tabbed[0]?.unit ?? 'lb';
  useContextualTour('lift', LIFT_HISTORY_STEPS, Boolean(user?.id && !isLoading && !error), user?.id);

  // Which of those challenges keep check-ins inside their own lobby, so the share sheet can hide
  // the Home toggle rather than offering something the lobby will refuse.
  useEffect(() => {
    const ids = liftingChallenges.map((challenge) => challenge.id);
    if (!ids.length) {
      setLockedChallengeIds([]);
      return;
    }
    let live = true;
    void fetchChallengeShareLocks(ids).then((locked) => {
      if (live) {
        setLockedChallengeIds(locked);
      }
    });
    return () => {
      live = false;
    };
  }, [liftingChallenges]);

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
      router.push(liftSessionHref(draft.id, { from: 'history' }));
    } catch (caught) {
      setMenuError(caught instanceof Error ? caught.message : 'Could not copy that lift.');
    }
  }

  /**
   * Home shares go through the ordinary post path, so a lift post gets mentions, photos, and GIFs
   * for free and lands in the feed the same way everything else does.
   */
  async function onComposeHome(input: ComposeInput) {
    setShareError(null);
    try {
      const post = await createPost.mutateAsync(input);
      setShareFor(null);
      if (post?.id) {
        await linkSessionToPost(String(input.liftSessionId ?? ''), String(post.id));
      }
    } catch (caught) {
      setShareError(caught instanceof Error ? caught.message : 'Could not share that lift.');
    }
  }

  async function deleteSession(target: LiftSessionSummary | null) {
    if (!target) {
      return;
    }
    setMenuError(null);
    try {
      await remove.mutateAsync(target.id);
      setMenuFor(null);
    } catch (caught) {
      setMenuError(caught instanceof Error ? caught.message : 'Could not delete that lift.');
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) {
      return;
    }
    setMenuError(null);
    try {
      await Promise.all(ids.map((id) => remove.mutateAsync(id)));
      setSelected(new Set());
      setSelecting(false);
    } catch (caught) {
      setMenuError(caught instanceof Error ? caught.message : 'Could not delete those lifts.');
    }
  }

  function toggleFavorite(target: LiftSessionSummary) {
    void favorite.mutateAsync({ id: target.id, favorite: !target.favorite });
  }

  function switchTab(next: 'favorites' | 'drafts' | 'completed') {
    setTab(next);
    setSelected(new Set());
    setSelecting(false);
  }

  /**
   * Share picks a destination here rather than opening the session. Reopening a finished lift to
   * share it invites an accidental edit to a session someone may already have a copy of.
   */
  async function openShare(target: LiftSessionSummary | null) {
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
      setSharedPostId(null);
      setShareError(null);
      setShareFor(source);
    } catch (caught) {
      setMenuError(caught instanceof Error ? caught.message : 'Could not open that lift.');
    }
  }

  async function onShare(choice: LiftShareChoice) {
    if (!shareFor) {
      return;
    }
    setShareError(null);
    try {
      if (choice.destination === 'live' && choice.challengeId) {
        const result = await attach.mutateAsync({
          draft: shareFor,
          challengeId: choice.challengeId,
          caption: choice.caption,
          home: choice.home && !lockedChallengeIds.includes(choice.challengeId),
        });
        setShareFor(null);
        router.push(
          challengeDetailHref(choice.challengeId, 'lobby', result.postId ?? undefined, {
            tab: 'feed',
          }),
        );
        return;
      }
      const toMessage = choice.destination === 'message';
      const posted = await share.mutateAsync({
        draft: shareFor,
        caption: choice.caption,
        challengeId: null,
        circleId: choice.circleId,
        home: !toMessage,
        audience: toMessage ? 'specific' : choice.circleId ? 'friends' : choice.audience,
        audienceUserIds: toMessage ? choice.recipientIds : undefined,
      });
      if (toMessage) {
        await sendLiftToRecipients({
          postId: posted.postId,
          recipientIds: choice.recipientIds,
          caption: choice.caption,
          startChat: (friendId: string) => startChat.mutateAsync(friendId),
          startGroup: (friendIds: string[]) => startGroup.mutateAsync(friendIds),
          send: (message) => sendMessage.mutateAsync(message).then(() => undefined),
        });
      }
      if (choice.circleId) {
        setShareFor(null);
        router.push(circleDetailHref(choice.circleId, { tab: 'chat' }));
        return;
      }
      setSharedPostId(posted.postId);
    } catch (caught) {
      setShareError(caught instanceof Error ? caught.message : 'Could not share that lift.');
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
      <TourAnchor id="tour-lift-history" style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {all.length === 0 ? (
          <MascotState
            kind="empty"
            title="No lifts yet"
            body="Pick your muscles, log your sets, and they land here."
          />
        ) : (
          <View style={{ flex: 1, minHeight: 0 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: 8,
              }}>
              {(['favorites', 'drafts', 'completed'] as const).map((item) => {
                const on = resolvedTab === item;
                const label = item === 'favorites' ? 'Favorites' : item === 'drafts' ? 'Drafts' : 'Completed';
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => switchTab(item)}
                    style={{
                      flex: 1,
                      minHeight: 36,
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
                        fontWeight: '800',
                        color: on ? THEME.accentForeground : THEME.textPrimary,
                      }}>
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: 10,
              }}>
              <AppText style={{ flex: 1, fontSize: 13, color: THEME.textMuted }}>
                {resolvedTab === 'completed' && completedWeight > 0
                  ? formatWeightMoved(completedWeight, weightUnit)
                  : filtering
                    ? `${rows.length} of ${tabbed.length} ${tabbed.length === 1 ? 'session' : 'sessions'}`
                    : `${tabbed.length} ${tabbed.length === 1 ? 'session' : 'sessions'}`}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selecting ? 'Cancel select' : 'Select lifts'}
                onPress={() => {
                  setSelecting((open) => !open);
                  setSelected(new Set());
                }}
                style={({ pressed }) => ({
                  minHeight: 36,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: selecting ? THEME.accent : THEME.border,
                  backgroundColor: selecting ? THEME.accentSoft : pressed ? THEME.accentSoft : THEME.surface,
                })}>
                <AppText
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: selecting ? THEME.accent : THEME.textPrimary,
                  }}>
                  {selecting ? 'Cancel' : 'Select'}
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={filtering ? 'Change filters' : 'Filter lifts'}
                accessibilityState={{ expanded: filterOpen }}
                onPress={() => setFilterOpen((open) => !open)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 36,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: filtering ? THEME.accent : THEME.border,
                  backgroundColor: filtering
                    ? THEME.accentSoft
                    : pressed
                      ? THEME.accentSoft
                      : THEME.surface,
                })}>
                <Glyph
                  name={GLYPH.search}
                  color={filtering ? THEME.accent : THEME.textMuted}
                  size={13}
                />
                <AppText
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: filtering ? THEME.accent : THEME.textPrimary,
                  }}>
                  {filtering ? `Filters · ${activeFilterCount(filter)}` : 'Filter'}
                </AppText>
              </Pressable>
            </View>

            {rows.length === 0 ? (
              <View style={{ flex: 1, minHeight: 0 }}>
                <MascotState
                  kind="empty"
                  title={
                    filtering
                      ? 'Nothing matches those filters'
                      : resolvedTab === 'favorites'
                        ? 'No favorites yet'
                        : resolvedTab === 'drafts'
                          ? 'No drafts'
                          : 'No completed lifts'
                  }
                  body={
                    filtering
                      ? 'Try a wider date range, or clear the muscles you picked.'
                      : resolvedTab === 'favorites'
                        ? 'Star a draft or a completed session to keep it here.'
                        : resolvedTab === 'drafts'
                          ? 'Open sessions stay here until you Complete them.'
                          : 'Check Done on leftover sets and rounds, then Complete.'
                  }
                  actionLabel={filtering ? 'Clear filters' : undefined}
                  onAction={filtering ? () => setFilter(EMPTY_LIFT_FILTER) : undefined}
                />
              </View>
            ) : (
              <View style={{ flex: 1, minHeight: 0 }}>
                <LiftList
                  rows={rows}
                  selecting={selecting}
                  selected={selected}
                  onOpen={(id) => router.push(liftSessionHref(id, { from: 'history' }))}
                  onMenu={(session) => setMenuFor(session)}
                  onStar={toggleFavorite}
                  onToggleSelect={(session) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(session.id)) {
                        next.delete(session.id);
                      } else {
                        next.add(session.id);
                      }
                      return next;
                    });
                  }}
                />
              </View>
            )}
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
          {selecting ? (
            <Button
              title={selected.size ? `Delete ${selected.size}` : 'Delete'}
              variant="danger"
              disabled={!selected.size}
              loading={remove.isPending}
              onPress={() => void deleteSelected()}
            />
          ) : (
            <Button title="Start lift" onPress={() => router.push(LIFT_START_HREF)} />
          )}
        </View>
      </View>
      </TourAnchor>

      <LiftHistoryMenu
        session={menuFor}
        busy={save.isPending || remove.isPending}
        error={menuError}
        onClose={() => {
          setMenuFor(null);
          setMenuError(null);
        }}
        onStartAgain={() => void startAgain(menuFor)}
        onOverload={() => void openOverload(menuFor)}
        onShare={() => void openShare(menuFor)}
        onFavorite={() => {
          if (menuFor) {
            toggleFavorite(menuFor);
          }
        }}
        onDelete={() => void deleteSession(menuFor)}
      />

      <LiftFilterSheet
        visible={filterOpen}
        filter={filter}
        muscles={filterMuscles}
        matchCount={rows.length}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />

      <LiftShareSheet
        visible={Boolean(shareFor)}
        draft={shareFor}
        challenges={liftingChallenges}
        lockedChallengeIds={lockedChallengeIds}
        busy={share.isPending || attach.isPending}
        error={shareError}
        sharedPostId={sharedPostId}
        onClose={() => setShareFor(null)}
        onShare={(choice) => void onShare(choice)}
        onComposeHome={(input) => onComposeHome(input)}
        onSkip={() => setShareFor(null)}
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
 * Share opens the same destination sheet the Done screen uses, so a caption and an audience are
 * chosen in one place no matter where the share started.
 */
function LiftHistoryMenu({
  session,
  busy,
  error,
  onClose,
  onStartAgain,
  onOverload,
  onShare,
  onFavorite,
  onDelete,
}: {
  session: LiftSessionSummary | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onStartAgain: () => void;
  onOverload: () => void;
  onShare: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reopening the menu on another session must not land with Delete already armed.
  useEffect(() => {
    setConfirmingDelete(false);
  }, [session?.id]);

  if (!session) {
    return null;
  }
  return (
    <ChromeOverlay visible onClose={busy ? undefined : onClose} align="end" zIndex={135}>
      <View
        style={{
          width: '100%',
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
        <MenuRow
          icon={session.favorite ? GLYPH.star : GLYPH.starOutline}
          label={session.favorite ? 'Remove favorite' : 'Favorite'}
          detail="Keeps it on the Favorites tab."
          disabled={busy}
          onPress={onFavorite}
        />
        <MenuRow
          icon={GLYPH.share}
          label="Share"
          detail={
            isCompletedStatus(session.status, session.completedAt)
              ? session.sharedPostId
                ? 'Already shared — post it again.'
                : 'Post the recap card.'
              : 'Share a template card. Weight moved stays off until Complete.'
          }
          disabled={busy}
          onPress={onShare}
        />
        {confirmingDelete ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 10,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: THEME.border,
            }}>
            <AppText style={{ flex: 1, fontSize: 13, color: THEME.textMuted }}>
              Delete this lift for good?
            </AppText>
            <Button
              title="Keep"
              variant="outline"
              size="sm"
              onPress={() => setConfirmingDelete(false)}
            />
            <Button title="Delete" variant="danger" size="sm" loading={busy} onPress={onDelete} />
          </View>
        ) : (
          <MenuRow
            icon={GLYPH.trash}
            label="Delete"
            detail="Removes it from your history. Anything you already shared stays up."
            disabled={busy}
            tone="danger"
            onPress={() => setConfirmingDelete(true)}
          />
        )}
      </View>
    </ChromeOverlay>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  disabled,
  tone,
  onPress,
}: {
  icon: GlyphId;
  label: string;
  detail: string;
  disabled?: boolean;
  tone?: 'danger';
  onPress: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        minHeight: 60,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: pressed ? THEME.accentSoft : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}>
      <View
        style={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}>
      <View
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: danger ? THEME.background : THEME.accentSoft,
        }}>
        <Glyph name={icon} color={danger ? THEME.danger : THEME.accent} size={15} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
        <AppText
          style={{
            minHeight: 20,
            fontSize: 15,
            fontWeight: '700',
            color: danger ? THEME.danger : THEME.textPrimary,
          }}>
          {label}
        </AppText>
        <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
          {detail}
        </AppText>
      </View>
      </View>
    </Pressable>
  );
}

function LiftList({
  rows,
  selecting,
  selected,
  onOpen,
  onMenu,
  onStar,
  onToggleSelect,
}: {
  rows: LiftSessionSummary[];
  selecting: boolean;
  selected: Set<string>;
  onOpen: (id: string) => void;
  onMenu: (session: LiftSessionSummary) => void;
  onStar: (session: LiftSessionSummary) => void;
  onToggleSelect: (session: LiftSessionSummary) => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1, width: '100%' }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        gap: 10,
        paddingHorizontal: 16,
        paddingBottom: 16,
        width: '100%',
      }}>
      {rows.map((row) => (
        <LiftHistoryCard
          key={row.id}
          session={row}
          selecting={selecting}
          selected={selected.has(row.id)}
          onPress={() => (selecting ? onToggleSelect(row) : onOpen(row.id))}
          onMenu={() => onMenu(row)}
          onStar={() => onStar(row)}
        />
      ))}
    </ScrollView>
  );
}

export function LiftHistoryCard({
  session,
  onPress,
  onMenu,
  onStar,
  selecting,
  selected,
}: {
  session: LiftSessionSummary;
  onPress: () => void;
  onMenu?: () => void;
  onStar?: () => void;
  selecting?: boolean;
  selected?: boolean;
}) {
  const completed = isCompletedStatus(session.status, session.completedAt);
  const chip = overloadChipLabel(session.overloadSummary);
  const countLabel =
    session.setCount > 0
      ? `${session.setCount} ${session.setCount === 1 ? 'set' : 'sets'}`
      : `${session.exerciseCount} ${session.exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  const subtitle = [muscleSummary(session.muscleKeys), shortDate(session.performedAt), countLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      collapsable={false}
      style={{
        alignSelf: 'stretch',
        width: '100%',
        borderRadius: 18,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        ...themeShadow('card'),
      }}>
      <View
        collapsable={false}
        style={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'flex-start',
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${session.title}`}
          onPress={onPress}
          style={({ pressed }) => ({
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
            paddingLeft: 14,
            paddingRight: 8,
            paddingTop: 14,
            paddingBottom: 14,
            borderRadius: 18,
            backgroundColor: pressed ? THEME.accentSoft : 'transparent',
          })}>
          <AppText
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              width: '100%',
              minHeight: 22,
              lineHeight: 22,
              fontSize: 16,
              fontWeight: '800',
              color: THEME.textPrimary,
            }}>
            {session.title}
          </AppText>
          <AppText
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              width: '100%',
              minHeight: 16,
              lineHeight: 16,
              marginTop: 2,
              fontSize: 12,
              color: THEME.textMuted,
            }}>
            {subtitle}
          </AppText>
          {completed ? (
            <View style={{ marginTop: 8 }}>
              <LiftCompletedCard card={buildCompletedCardFromSummary(session)} compact hideChrome />
            </View>
          ) : session.preview.length ? (
            <View style={{ marginTop: 8, gap: 2, width: '100%' }}>
              {session.preview.map((line) => (
                <AppText
                  key={line}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ fontSize: 13, lineHeight: 18, color: THEME.textPrimary }}>
                  {line}
                </AppText>
              ))}
            </View>
          ) : null}
        </Pressable>
        <View
          style={{
            flexGrow: 0,
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 8,
            paddingRight: 4,
          }}>
          {chip ? (
            <View
              style={{
                paddingHorizontal: 8,
                height: 22,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: THEME.accent,
                marginRight: 4,
              }}>
              <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accentForeground }}>
                {chip}
              </AppText>
            </View>
          ) : null}
          {completed ? null : (
            <View
              style={{
                paddingHorizontal: 8,
                height: 22,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: THEME.accentSoft,
                marginRight: 4,
              }}>
              <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accent }}>Draft</AppText>
            </View>
          )}
          {onStar && !selecting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={session.favorite ? 'Remove favorite' : 'Favorite'}
              hitSlop={6}
              onPress={onStar}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                backgroundColor: pressed ? THEME.accentSoft : 'transparent',
              })}>
              <Glyph
                name={session.favorite ? GLYPH.star : GLYPH.starOutline}
                color={session.favorite ? THEME.accent : THEME.textMuted}
                size={16}
              />
            </Pressable>
          ) : null}
          <View
            pointerEvents="none"
            style={{
              width: 28,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Glyph name={GLYPH.chevronRight} color={THEME.textMuted} size={14} />
          </View>
          {onMenu && !selecting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More options for ${session.title}`}
              hitSlop={6}
              onPress={onMenu}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                backgroundColor: pressed ? THEME.accentSoft : 'transparent',
              })}>
              <Glyph name={GLYPH.more} color={THEME.textMuted} size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
