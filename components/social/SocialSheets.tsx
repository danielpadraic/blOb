import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Composer } from '@/components/feed/Composer';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCreatePost } from '@/hooks/useFeed';
import {
  useHiddenPostIds,
  useHidePost,
  useMutedUserIds,
  useReportPost,
  useSoftDeletePost,
  useToggleMute,
} from '@/hooks/usePostModeration';
import { useFriends, useGetOrCreateConversation, useSendMessage } from '@/hooks/useSocial';
import { postShareUrl } from '@/lib/postShare';
import { snapshotFromPost } from '@/lib/quotePost';
import { personDisplayName } from '@/lib/social';
import { THEME, themeShadow } from '@/lib/theme';
import type { PostWithMeta } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Other' },
] as const;

type Sheet =
  | { kind: 'overflow'; post: PostWithMeta }
  | { kind: 'share'; post: PostWithMeta }
  | { kind: 'report'; post: PostWithMeta }
  | { kind: 'delete'; post: PostWithMeta }
  | { kind: 'quote'; post: PostWithMeta }
  | { kind: 'send'; post: PostWithMeta }
  | { kind: 'profile'; userId: string; muted: boolean };

type SocialSheetsValue = {
  toggleOverflow: (post: PostWithMeta) => void;
  toggleProfileMenu: (userId: string) => void;
  openShare: (post: PostWithMeta) => void;
  isOpenFor: (postId: string) => boolean;
  isMuted: (userId: string) => boolean;
  isHidden: (postId: string) => boolean;
};

const SocialSheetsContext = createContext<SocialSheetsValue | null>(null);

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

export function SocialSheetsHost({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hides = useHiddenPostIds();
  const mutes = useMutedUserIds();
  const hidden = useMemo(() => new Set(hides.data ?? []), [hides.data]);
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

  const toggleOverflow = useCallback((post: PostWithMeta) => {
    setSheet((current) =>
      current?.kind === 'overflow' && current.post.id === post.id ? null : { kind: 'overflow', post },
    );
  }, []);

  const toggleProfileMenu = useCallback(
    (userId: string) => {
      setSheet((current) =>
        current?.kind === 'profile' && current.userId === userId
          ? null
          : { kind: 'profile', userId, muted: muted.has(userId) },
      );
    },
    [muted],
  );

  const openShare = useCallback((post: PostWithMeta) => {
    setSheet({ kind: 'share', post });
  }, []);

  const value = useMemo<SocialSheetsValue>(
    () => ({
      toggleOverflow,
      toggleProfileMenu,
      openShare,
      isOpenFor: (postId) => sheet?.kind === 'overflow' && sheet.post.id === postId,
      isMuted: (userId) => muted.has(userId),
      isHidden: (postId) => hidden.has(postId),
    }),
    [hidden, muted, openShare, sheet, toggleOverflow, toggleProfileMenu],
  );

  return (
    <SocialSheetsContext.Provider value={value}>
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
      <OverflowSheet
        post={sheet.post}
        userId={userId}
        onClose={onClose}
        onShare={() => onOpen({ kind: 'share', post: sheet.post })}
        onReport={() => onOpen({ kind: 'report', post: sheet.post })}
        onDelete={() => onOpen({ kind: 'delete', post: sheet.post })}
      />
    );
  }
  if (sheet.kind === 'share') {
    return (
      <ShareSheet
        post={sheet.post}
        onClose={onClose}
        onRepost={() => onOpen({ kind: 'quote', post: sheet.post })}
        onSend={() => onOpen({ kind: 'send', post: sheet.post })}
        onToast={onToast}
      />
    );
  }
  if (sheet.kind === 'report') {
    return <ReportSheet post={sheet.post} onClose={onClose} onToast={onToast} />;
  }
  if (sheet.kind === 'delete') {
    return <DeleteSheet post={sheet.post} onClose={onClose} onToast={onToast} />;
  }
  if (sheet.kind === 'quote') {
    return <QuoteSheet post={sheet.post} onClose={onClose} />;
  }
  if (sheet.kind === 'send') {
    return <SendSheet post={sheet.post} onClose={onClose} onToast={onToast} />;
  }
  return (
    <ProfileMuteSheet
      userId={sheet.userId}
      muted={sheet.muted}
      onClose={onClose}
      onToast={onToast}
    />
  );
}

function OverflowSheet({
  post,
  userId,
  onClose,
  onShare,
  onReport,
  onDelete,
}: {
  post: PostWithMeta;
  userId?: string;
  onClose: () => void;
  onShare: () => void;
  onReport: () => void;
  onDelete: () => void;
}) {
  const hide = useHidePost();
  const mine = Boolean(userId && userId === post.author_id);

  return (
    <ChromeOverlay visible onClose={onClose}>
      <IconSheet>
        <IconAction
          label="Share"
          icon={GLYPH.send}
          onPress={onShare}
        />
        {!mine ? (
          <IconAction
            label="Hide"
            icon={GLYPH.hide}
            onPress={() => {
              hide.mutate(post.id, {
                onSuccess: () => {
                  onClose();
                },
                onError: (error) => Alert.alert('Couldn’t hide that', getErrorMessage(error)),
              });
            }}
          />
        ) : null}
        {!mine ? (
          <IconAction label="Report" icon={GLYPH.flag} color={THEME.danger} onPress={onReport} />
        ) : null}
        {mine ? (
          <IconAction label="Delete" icon={GLYPH.trash} color={THEME.danger} onPress={onDelete} />
        ) : null}
      </IconSheet>
    </ChromeOverlay>
  );
}

function ShareSheet({
  post,
  onClose,
  onRepost,
  onSend,
  onToast,
}: {
  post: PostWithMeta;
  onClose: () => void;
  onRepost: () => void;
  onSend: () => void;
  onToast: (message: string) => void;
}) {
  return (
    <ChromeOverlay visible onClose={onClose}>
      <ListSheet>
        <ListRow
          label="Send in DM"
          onPress={onSend}
        />
        <ListRow label="Repost" onPress={onRepost} />
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
      </ListSheet>
    </ChromeOverlay>
  );
}

function ReportSheet({
  post,
  onClose,
  onToast,
}: {
  post: PostWithMeta;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const report = useReportPost();
  return (
    <ChromeOverlay visible onClose={onClose}>
      <ListSheet>
        <AppText className="px-1 pb-3 text-[15px] font-extrabold text-charcoal">Report</AppText>
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
      </ListSheet>
    </ChromeOverlay>
  );
}

function DeleteSheet({
  post,
  onClose,
  onToast,
}: {
  post: PostWithMeta;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const remove = useSoftDeletePost();
  return (
    <ChromeOverlay visible onClose={onClose}>
      <ListSheet>
        <AppText className="mb-3 text-[16px] font-extrabold text-charcoal">Delete post?</AppText>
        <Button
          title="Delete"
          variant="danger"
          loading={remove.isPending}
          onPress={() => {
            remove.mutate(post.id, {
              onSuccess: () => {
                onClose();
                onToast('Deleted.');
              },
              onError: (error) => Alert.alert('Couldn’t delete that', getErrorMessage(error)),
            });
          }}
        />
      </ListSheet>
    </ChromeOverlay>
  );
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

function SendSheet({
  post,
  onClose,
  onToast,
}: {
  post: PostWithMeta;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const friends = useFriends();
  const startChat = useGetOrCreateConversation();
  const send = useSendMessage();
  const rows = friends.data ?? [];

  async function sendTo(userId: string) {
    const conversation = await startChat.mutateAsync(userId);
    await send.mutateAsync({
      conversation_id: conversation.id,
      body: postShareUrl(post.id),
    });
    onClose();
    onToast('Sent.');
  }

  return (
    <ChromeOverlay visible onClose={onClose}>
      <ListSheet>
        <AppText className="mb-3 text-[16px] font-extrabold text-charcoal">Send in DM</AppText>
        {rows.length === 0 ? (
          <AppText className="text-sm text-muted">Add friends first.</AppText>
        ) : (
          <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
            {rows.map((row) => {
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
                  className="flex-row items-center py-2.5"
                  style={{ minHeight: 44 }}>
                  <Avatar uri={row.profile?.avatar_url} name={name} size={36} />
                  <AppText className="ml-3 flex-1 text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                    {name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </ListSheet>
    </ChromeOverlay>
  );
}

function ProfileMuteSheet({
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
  return (
    <ChromeOverlay visible onClose={onClose}>
      <ListSheet>
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
      </ListSheet>
    </ChromeOverlay>
  );
}

function IconSheet({ children }: { children: ReactNode }) {
  return (
    <View className="items-center px-5 pb-5 pt-3">
      <View
        className="flex-row items-center justify-center"
        style={{
          backgroundColor: THEME.surface,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: THEME.border,
          paddingHorizontal: 10,
          paddingVertical: 10,
          columnGap: 8,
          ...themeShadow('card'),
        }}>
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
      style={{ width: 52, height: 52, minWidth: 44, minHeight: 44, borderRadius: 16 }}>
      <Glyph name={icon} color={color} size={22} />
    </Pressable>
  );
}

function ListSheet({ children }: { children: ReactNode }) {
  return (
    <View
      className="px-5 pt-4"
      style={{
        backgroundColor: THEME.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 16,
        maxHeight: '100%',
      }}>
      {children}
    </View>
  );
}

function ListRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="justify-center px-1"
      style={{ minHeight: 48, borderBottomWidth: 1, borderBottomColor: THEME.border }}>
      <AppText className="text-[16px] font-semibold text-charcoal">{label}</AppText>
    </Pressable>
  );
}
