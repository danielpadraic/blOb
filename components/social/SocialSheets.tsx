import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { AudienceSheet, type AudienceDraft } from '@/components/feed/AudienceSheet';
import { Composer } from '@/components/feed/Composer';
import { PostEditHistory, PostEditor } from '@/components/feed/PostEditor';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Avatar } from '@/components/ui/Avatar';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCreatePost } from '@/hooks/useFeed';
import {
  useBlockUser,
  useHidePost,
  useMutedUserIds,
  useRemoveFromWall,
  useReportPost,
  useSoftDeletePost,
  useToggleMute,
} from '@/hooks/usePostModeration';
import { usePostEdits } from '@/hooks/usePostEdit';
import { isCheckinPost } from '@/lib/checkinPost';
import {
  useFriends,
  useFriendshipStatus,
  useGetOrCreateConversation,
  useSendMessage,
  useUnfriend,
} from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { postShareUrl } from '@/lib/postShare';
import { snapshotFromPost } from '@/lib/quotePost';
import { personDisplayName } from '@/lib/social';
import { THEME, themeShadow } from '@/lib/theme';
import type { PostWithMeta } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { useBugReport } from '@/components/bug/BugReportHost';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Other' },
] as const;

export type WindowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OverflowPanel = 'menu' | 'share' | 'report' | 'send';

type Sheet =
  | { kind: 'overflow'; post: PostWithMeta; anchor: WindowRect; panel: OverflowPanel }
  | { kind: 'quote'; post: PostWithMeta }
  | { kind: 'edit'; post: PostWithMeta }
  | { kind: 'history'; post: PostWithMeta }
  | { kind: 'profile'; userId: string; muted: boolean; anchor: WindowRect }
  | { kind: 'audience'; draft: AudienceDraft };

type SocialSheetsValue = {
  toggleOverflow: (post: PostWithMeta, anchor: WindowRect) => void;
  toggleProfileMenu: (userId: string, anchor: WindowRect) => void;
  openShare: (post: PostWithMeta, anchor: WindowRect) => void;
  openAudience: (draft: AudienceDraft) => void;
  openEdit: (post: PostWithMeta) => void;
  openHistory: (post: PostWithMeta) => void;
};

type OverflowOpenStore = {
  getId: () => string | null;
  setId: (id: string | null) => void;
  subscribe: (listener: () => void) => () => void;
};

const SocialSheetsContext = createContext<SocialSheetsValue | null>(null);
const OverflowOpenStoreContext = createContext<OverflowOpenStore | null>(null);

function createOverflowOpenStore(): OverflowOpenStore {
  let id: string | null = null;
  const listeners = new Set<() => void>();
  return {
    getId: () => id,
    setId: (next) => {
      if (id === next) {
        return;
      }
      id = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function subscribeNever() {
  return () => undefined;
}

let closeSocialSheetsFn: (() => void) | null = null;

export function closeSocialSheets() {
  closeSocialSheetsFn?.();
}

export function useSocialSheets() {
  const value = useContext(SocialSheetsContext);
  if (!value) {
    throw new Error('useSocialSheets must be used inside SocialSheetsHost');
  }
  return value;
}

export function useSocialSheetsOptional() {
  return useContext(SocialSheetsContext);
}

/** Only the matching card re-renders when the overflow id changes. */
export function useOverflowMenuOpen(postId: string) {
  const store = useContext(OverflowOpenStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : subscribeNever,
    () => (store ? store.getId() === postId : false),
    () => false,
  );
}

export function SocialSheetsHost({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mutes = useMutedUserIds();
  const muted = useMemo(() => new Set(mutes.data ?? []), [mutes.data]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 1800);
  }, []);

  const close = useCallback(() => setSheet(null), []);

  useEffect(() => {
    closeSocialSheetsFn = close;
    return () => {
      if (closeSocialSheetsFn === close) {
        closeSocialSheetsFn = null;
      }
    };
  }, [close]);

  const toggleOverflow = useCallback((post: PostWithMeta, anchor: WindowRect) => {
    setSheet((current) =>
      current?.kind === 'overflow' && current.post.id === post.id
        ? null
        : { kind: 'overflow', post, anchor, panel: 'menu' },
    );
  }, []);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const toggleProfileMenu = useCallback((userId: string, anchor: WindowRect) => {
    setSheet((current) =>
      current?.kind === 'profile' && current.userId === userId
        ? null
        : { kind: 'profile', userId, muted: mutedRef.current.has(userId), anchor },
    );
  }, []);

  const openShare = useCallback((post: PostWithMeta, anchor: WindowRect) => {
    setSheet({ kind: 'overflow', post, anchor, panel: 'share' });
  }, []);

  const openAudience = useCallback((draft: AudienceDraft) => {
    setSheet({ kind: 'audience', draft });
  }, []);

  const openEdit = useCallback((post: PostWithMeta) => {
    setSheet({ kind: 'edit', post });
  }, []);

  const openHistory = useCallback((post: PostWithMeta) => {
    setSheet({ kind: 'history', post });
  }, []);

  const overflowStore = useMemo(createOverflowOpenStore, []);

  useEffect(() => {
    overflowStore.setId(sheet?.kind === 'overflow' ? sheet.post.id : null);
  }, [overflowStore, sheet]);

  const value = useMemo<SocialSheetsValue>(
    () => ({
      toggleOverflow,
      toggleProfileMenu,
      openShare,
      openAudience,
      openEdit,
      openHistory,
    }),
    [openAudience, openEdit, openHistory, openShare, toggleOverflow, toggleProfileMenu],
  );

  return (
    <SocialSheetsContext.Provider value={value}>
      <OverflowOpenStoreContext.Provider value={overflowStore}>
      {children}
      <SheetView
        sheet={sheet}
        userId={user?.id}
        onClose={close}
        onToast={showToast}
        onOpen={(next) => setSheet(next)}
      />
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 16, zIndex: 60 }}>
          <View
            className="mx-8 items-center px-4 py-2.5"
            style={{
              backgroundColor: THEME.primary,
              borderRadius: 16,
              ...themeShadow('card'),
            }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {toast}
            </AppText>
          </View>
        </View>
      ) : null}
      </OverflowOpenStoreContext.Provider>
    </SocialSheetsContext.Provider>
  );
}

function SheetView({
  sheet,
  userId,
  onClose,
  onToast,
  onOpen,
}: {
  sheet: Sheet | null;
  userId?: string;
  onClose: () => void;
  onToast: (message: string) => void;
  onOpen: (sheet: Sheet) => void;
}) {
  if (!sheet) {
    return null;
  }
  if (sheet.kind === 'overflow') {
    return (
      <OverflowPopover
        post={sheet.post}
        userId={userId}
        anchor={sheet.anchor}
        panel={sheet.panel}
        onClose={onClose}
        onToast={onToast}
        onPanel={(panel) => onOpen({ ...sheet, panel })}
        onQuote={() => onOpen({ kind: 'quote', post: sheet.post })}
        onEdit={() => onOpen({ kind: 'edit', post: sheet.post })}
      />
    );
  }
  if (sheet.kind === 'quote') {
    return <QuoteSheet post={sheet.post} onClose={onClose} />;
  }
  if (sheet.kind === 'edit') {
    return (
      <PostEditor
        post={sheet.post}
        onClose={onClose}
        onToast={onToast}
        onSaved={() => onToast('Saved.')}
      />
    );
  }
  if (sheet.kind === 'history') {
    return <HistorySheet post={sheet.post} onClose={onClose} />;
  }
  if (sheet.kind === 'audience') {
    return <AudienceSheet draft={sheet.draft} onClose={onClose} />;
  }
  return (
    <AnchoredPopover anchor={sheet.anchor} onClose={onClose}>
      <ProfileMuteMenu
        userId={sheet.userId}
        muted={sheet.muted}
        onClose={onClose}
        onToast={onToast}
      />
    </AnchoredPopover>
  );
}

function OverflowPopover({
  post,
  userId,
  anchor,
  panel,
  onClose,
  onToast,
  onPanel,
  onQuote,
  onEdit,
}: {
  post: PostWithMeta;
  userId?: string;
  anchor: WindowRect;
  panel: OverflowPanel;
  onClose: () => void;
  onToast: (message: string) => void;
  onPanel: (panel: OverflowPanel) => void;
  onQuote: () => void;
  onEdit: () => void;
}) {
  const hide = useHidePost();
  const report = useReportPost();
  const removeFromWall = useRemoveFromWall();
  const softDelete = useSoftDeletePost();
  const friends = useFriends();
  const startChat = useGetOrCreateConversation();
  const send = useSendMessage();
  const [busy, setBusy] = useState(false);
  const mine = Boolean(userId && userId === post.author_id);
  const host = Boolean(userId && post.wall_host_id && userId === post.wall_host_id && !post.wall_removed_at);

  async function onRemoveFromWall() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await removeFromWall.mutateAsync(post.id);
      onClose();
      onToast(copy('wall.remove'));
    } catch (error) {
      Alert.alert('Couldn’t remove that', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendTo(friendId: string) {
    const conversation = await startChat.mutateAsync(friendId);
    await send.mutateAsync({
      conversation_id: conversation.id,
      body: postShareUrl(post.id),
    });
    onClose();
    onToast('Sent.');
  }

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose}>
      {panel === 'menu' ? (
        <View>
          <View className="flex-row items-center" style={{ columnGap: 2 }}>
            {mine ? (
              <IconAction
                label={copy('post.edit')}
                icon={GLYPH.pencil}
                onPress={onEdit}
              />
            ) : null}
            <IconAction
              label="Share"
              icon={GLYPH.share}
              onPress={() => onPanel('share')}
            />
            {!mine ? (
              <IconAction
                label="Hide"
                icon={GLYPH.hide}
                onPress={() => {
                  hide.mutate(post.id, {
                    onSuccess: () => onClose(),
                    onError: (error) => Alert.alert('Couldn’t hide that', getErrorMessage(error)),
                  });
                }}
              />
            ) : null}
            {!mine ? (
              <IconAction
                label="Report"
                icon={GLYPH.flag}
                color={THEME.danger}
                onPress={() => onPanel('report')}
              />
            ) : null}
          </View>
          {mine && !isCheckinPost(post) ? (
            <ListRow
              label={copy('post.delete')}
              onPress={() => {
                Alert.alert(copy('post.deleteConfirm'), undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: copy('post.delete'),
                    style: 'destructive',
                    onPress: () => {
                      softDelete.mutate(post.id, {
                        onSuccess: () => {
                          onClose();
                          onToast('Deleted.');
                        },
                        onError: (error) => Alert.alert('Couldn’t delete that', getErrorMessage(error)),
                      });
                    },
                  },
                ]);
              }}
            />
          ) : null}
          {host ? (
            <ListRow label={copy('wall.remove')} onPress={() => void onRemoveFromWall()} />
          ) : null}
        </View>
      ) : null}

      {panel === 'share' ? (
        <View style={{ minWidth: 168 }}>
          <ListRow label="Send in DM" onPress={() => onPanel('send')} />
          <ListRow label="Repost" onPress={onQuote} />
          <ListRow
            label="Copy link"
            onPress={() => {
              void Clipboard.setStringAsync(postShareUrl(post.id))
                .then(() => {
                  onClose();
                  onToast('Link copied.');
                })
                .catch((error) => Alert.alert('Couldn’t copy that', getErrorMessage(error)));
            }}
          />
        </View>
      ) : null}

      {panel === 'report' ? (
        <View style={{ minWidth: 196, paddingHorizontal: 6, paddingVertical: 4 }}>
          <AppText className="px-1 pb-2 text-[13px] font-extrabold text-charcoal">Report</AppText>
          <ChipRow>
            {REPORT_REASONS.map((reason) => (
              <Chip
                key={reason.value}
                label={reason.label}
                onPress={() => {
                  report.mutate(
                    { postId: post.id, reason: reason.value },
                    {
                      onSuccess: () => {
                        onClose();
                        onToast('Reported.');
                      },
                      onError: (error) => Alert.alert('Couldn’t report that', getErrorMessage(error)),
                    },
                  );
                }}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {panel === 'send' ? (
        <View style={{ minWidth: 200, maxWidth: 260, paddingHorizontal: 6, paddingVertical: 4 }}>
          <AppText className="px-1 pb-2 text-[13px] font-extrabold text-charcoal">Send in DM</AppText>
          {(friends.data ?? []).length === 0 ? (
            <AppText className="px-1 pb-1 text-sm text-muted">Add friends first.</AppText>
          ) : (
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
              {(friends.data ?? []).map((row) => {
                const id = row.profile?.id;
                if (!id) {
                  return null;
                }
                const name = personDisplayName(row.profile);
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={`Send to ${name}`}
                    onPress={() => {
                      void sendTo(id).catch((error) =>
                        Alert.alert('Couldn’t send that', getErrorMessage(error)),
                      );
                    }}
                    className="flex-row items-center py-2"
                    style={{ minHeight: 44 }}>
                    <Avatar uri={row.profile?.avatar_url} name={name} size={32} />
                    <AppText className="ml-2 flex-1 text-[13px] font-semibold text-charcoal" numberOfLines={1}>
                      {name}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </AnchoredPopover>
  );
}

function HistorySheet({ post, onClose }: { post: PostWithMeta; onClose: () => void }) {
  const edits = usePostEdits(post.id);
  return <PostEditHistory rows={edits.data ?? []} onClose={onClose} />;
}

function QuoteSheet({ post, onClose }: { post: PostWithMeta; onClose: () => void }) {
  const createPost = useCreatePost();
  const snapshot = snapshotFromPost(post);
  return (
    <ChromeOverlay visible onClose={onClose} align="start">
      <View
        className="px-4 pt-4"
        style={{
          backgroundColor: THEME.surface,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          paddingBottom: 16,
          maxHeight: '100%',
        }}>
        <Composer
          autoFocus
          submitting={createPost.isPending}
          placeholder="Add a caption…"
          quote={{ postId: post.id, snapshot, audience: snapshot.audience }}
          onSubmit={async (input) => {
            await createPost.mutateAsync({
              ...input,
              quotedPostId: post.id,
              quoteSnapshot: snapshot,
            });
            onClose();
          }}
        />
      </View>
    </ChromeOverlay>
  );
}

function ProfileMuteMenu({
  userId,
  muted,
  onClose,
  onToast,
}: {
  userId: string;
  muted: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const toggle = useToggleMute();
  const block = useBlockUser();
  const unfriend = useUnfriend();
  const friendship = useFriendshipStatus(userId);
  const bugReport = useBugReport();
  const accepted = friendship.data?.status === 'accepted';
  return (
    <View style={{ minWidth: 140 }}>
      {accepted ? (
        <ListRow
          label="Unfriend"
          onPress={() => {
            Alert.alert('Unfriend?', '', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Unfriend',
                style: 'destructive',
                onPress: () => {
                  unfriend.mutate(userId, {
                    onSuccess: () => {
                      onClose();
                      onToast('Unfriended.');
                    },
                    onError: (error) => Alert.alert('Couldn’t unfriend', getErrorMessage(error)),
                  });
                },
              },
            ]);
          }}
        />
      ) : null}
      <ListRow
        label="Report a problem"
        onPress={() => {
          onClose();
          bugReport.open();
        }}
      />
      <ListRow
        label={muted ? 'Unmute' : 'Mute'}
        onPress={() => {
          toggle.mutate(
            { userId, muted },
            {
              onSuccess: () => {
                onClose();
                onToast(muted ? 'Unmuted.' : 'Muted.');
              },
              onError: (error) => Alert.alert('Couldn’t update that', getErrorMessage(error)),
            },
          );
        }}
      />
      <ListRow
        label={copy('wall.block')}
        onPress={() => {
          block.mutate(userId, {
            onSuccess: () => {
              onClose();
              onToast(copy('wall.block'));
            },
            onError: (error) => Alert.alert('Couldn’t block that', getErrorMessage(error)),
          });
        }}
      />
    </View>
  );
}

function AnchoredPopover({
  anchor,
  onClose,
  children,
}: {
  anchor: WindowRect;
  onClose: () => void;
  children: ReactNode;
}) {
  const hostRef = useRef<View>(null);
  const [host, setHost] = useState<WindowRect | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  function measureHost() {
    hostRef.current?.measureInWindow((x, y, width, height) => {
      setHost({ x, y, width, height });
    });
  }

  const windowSize = Dimensions.get('window');
  const hostX = host?.x ?? 0;
  const hostY = host?.y ?? 0;
  const hostW = host?.width || windowSize.width;
  const hostH = host?.height || windowSize.height;
  const popW = box.width || 168;
  const popH = box.height || 56;
  const gap = 6;
  const localX = anchor.x - hostX;
  const localY = anchor.y - hostY;
  let top = localY + anchor.height + gap;
  if (top + popH > hostH - 8) {
    const above = localY - gap - popH;
    top = above >= 8 ? above : Math.max(8, hostH - popH - 8);
  }
  let left = localX + anchor.width - popW;
  left = Math.min(Math.max(8, left), Math.max(8, hostW - popW - 8));

  return (
    <View
      ref={hostRef}
      pointerEvents="box-none"
      collapsable={false}
      onLayout={measureHost}
      style={styles.host}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        style={styles.dismiss}
      />
      <View
        pointerEvents="auto"
        collapsable={false}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width !== box.width || height !== box.height) {
            setBox({ width, height });
          }
        }}
        style={[
          styles.popover,
          {
            top,
            left,
            backgroundColor: THEME.surface,
            borderColor: THEME.border,
            ...themeShadow('card'),
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

function IconAction({
  label,
  icon,
  color = THEME.textPrimary,
  onPress,
}: {
  label: string;
  icon: GlyphId;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="items-center justify-center"
      style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: 14 }}>
      <Glyph name={icon} color={color} size={20} />
    </Pressable>
  );
}

function ListRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="justify-center px-3"
      style={{ minHeight: 44 }}>
      <AppText className="text-[14px] font-semibold text-charcoal">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    elevation: 40,
  },
  dismiss: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  popover: {
    position: 'absolute',
    zIndex: 41,
    elevation: 41,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
});
