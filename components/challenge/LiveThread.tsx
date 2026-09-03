import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveBubble } from '@/components/challenge/LiveBubble';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { MascotState } from '@/components/mascot/MascotState';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { useEditPost } from '@/hooks/usePostEdit';
import { copy } from '@/lib/copy';
import {
  buildLiveThreadRows,
  findLiveParent,
  liveChatText,
  isLiveCheckinPost,
  liveComposeFromInline,
  liveEditMediaUrls,
  liveEditPrefill,
  liveQuoteLine,
  liveQuotePreview,
  type LiveThreadRow,
} from '@/lib/liveThread';
import type { MentionChip } from '@/lib/mentions';
import { authorLabel, resolveLiveAuthor, safeUserId } from '@/lib/safeIds';
import { tabBarLift, THEME } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';
import type { CommentWithAuthor, ComposeInput, PostSource, PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type LiveReplyTarget = {
  postId: string;
  name: string;
  preview: string;
  avatarUrl?: string | null;
  mention?: MentionChip | null;
};

type LiveThreadProps = {
  posts: PostWithMeta[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  currentUserId?: string;
  emptyTitle: string;
  emptyBody: string;
  canCompose?: boolean;
  composing?: boolean;
  highlightPostId?: string;
  footerReserve?: number;
  memberIds?: string[];
  placeholder?: string;
  sendLabel?: string;
  loadingTitle?: string;
  composeSource?: PostSource;
  composeAudience?: PostAudience;
  onRefresh?: () => void;
  onRetry?: () => void;
  onCompose: (input: ComposeInput) => Promise<unknown> | void;
  onReact: (post: PostWithMeta, type: ReactionType, commentId?: string | null) => void;
};

export function LiveThread({
  posts,
  isLoading,
  isRefreshing,
  error,
  currentUserId,
  emptyTitle,
  emptyBody,
  canCompose = true,
  composing,
  highlightPostId,
  footerReserve = 0,
  memberIds,
  placeholder,
  sendLabel,
  loadingTitle,
  composeSource = 'challenge',
  composeAudience = 'public',
  onRefresh,
  onRetry,
  onCompose,
  onReact,
}: LiveThreadProps) {
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const keyboardOpen = keyboardOverlap > 0;
  const social = useSocialSheetsOptional();
  const editPost = useEditPost();
  const listRef = useRef<FlatList<LiveThreadRow>>(null);
  const highlightedOnce = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<LiveReplyTarget | null>(null);
  const [editing, setEditing] = useState<PostWithMeta | null>(null);
  const rows = useMemo(
    () => buildLiveThreadRows((posts ?? []).filter((post) => Boolean(post?.id))),
    [posts],
  );
  const lastId = rows.at(-1)?.id;

  const pinToLiveEdge = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }
    if (
      highlightPostId &&
      highlightPostId !== lastId &&
      highlightedOnce.current !== highlightPostId
    ) {
      const index = rows.findIndex((row) => row.id === highlightPostId);
      if (index >= 0) {
        highlightedOnce.current = highlightPostId;
        const timer = setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.85 });
          } catch {
            pinToLiveEdge(false);
          }
        }, 80);
        return () => clearTimeout(timer);
      }
    }
    pinToLiveEdge(false);
  }, [highlightPostId, lastId, pinToLiveEdge, rows]);

  const submitLine = useCallback(
    async (content: string, mentionedUserIds: string[] = [], parentId?: string | null) => {
      const split = liveComposeFromInline(content);
      if (editing) {
        const mediaUrls = liveEditMediaUrls(editing, split.mediaUrls);
        if (isLiveCheckinPost(editing) && mediaUrls.length === 0) {
          Alert.alert(copy('post.savePhotoFirst'));
          return;
        }
        if (!split.text && mediaUrls.length === 0) {
          return;
        }
        await editPost.mutateAsync({
          postId: editing.id,
          caption: split.text,
          mediaUrls,
          hiddenMediaUrls: editing.hidden_media_urls ?? [],
          checkinId: editing.checkin_id,
        });
        setEditing(null);
        pinToLiveEdge(true);
        return;
      }
      if (!split.text && split.mediaUrls.length === 0) {
        return;
      }
      await onCompose({
        content: split.text,
        mediaUrls: split.mediaUrls,
        source: composeSource,
        audience: composeAudience,
        mentionedUserIds,
        parentId: parentId ?? null,
      });
      setReplyTo(null);
      pinToLiveEdge(true);
    },
    [composeAudience, composeSource, editPost, editing, onCompose, pinToLiveEdge],
  );

  const startReply = useCallback((target: LiveReplyTarget) => {
    setEditing(null);
    setReplyTo(target);
  }, []);

  const startEdit = useCallback((post: PostWithMeta) => {
    setReplyTo(null);
    setEditing(post);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LiveThreadRow }) => {
      if (item.kind === 'comment') {
        const display = commentAsLivePost(item.comment, item.parent);
        const parentAuthor = resolveLiveAuthor(item.parent);
        const commentAuthor = resolveLiveAuthor({
          id: item.comment.id,
          author: item.comment.author,
          author_id: item.comment.author_id,
        });
        return (
          <View style={{ paddingHorizontal: 16, overflow: 'visible' }}>
            <LiveBubble
              post={display}
              currentUserId={currentUserId}
              quote={{
                name: parentAuthor.name,
                text: liveQuotePreview(item.parent) || liveChatText(item.parent.content, item.parent.media_urls),
                avatarUrl: parentAuthor.avatarUrl,
              }}
              reactions={item.comment.reactions}
              onReact={(type) => onReact(item.parent, type, item.comment.id)}
              onReply={
                canCompose
                  ? () =>
                      startReply({
                        postId: item.parent.id,
                        name: commentAuthor.name,
                        preview: liveChatText(item.comment.content) || 'Message',
                        avatarUrl: commentAuthor.avatarUrl,
                        mention: mentionFromAuthor(item.comment.author, item.comment.author_id),
                      })
                  : undefined
              }
            />
          </View>
        );
      }

      const parent = findLiveParent(posts, item.post.parent_id);
      const parentAuthor = parent ? resolveLiveAuthor(parent) : null;
      const postAuthor = resolveLiveAuthor(item.post);
      const quote =
        parent && !isLiveCheckinPost(item.post) && !isLiveCheckinPost(parent)
          ? {
              name: parentAuthor?.name ?? 'Someone',
              text: liveQuotePreview(parent),
              avatarUrl: parentAuthor?.avatarUrl,
            }
          : null;
      return (
        <View style={{ paddingHorizontal: 16, overflow: 'visible' }}>
          <LiveBubble
            post={item.post}
            currentUserId={currentUserId}
            highlighted={highlightPostId === item.post.id}
            quote={quote}
            onReact={(type) => onReact(item.post, type)}
            onEdit={
              currentUserId && postAuthor.authorId === currentUserId
                ? () => startEdit(item.post)
                : undefined
            }
            onHistory={
              item.post.edited_at && currentUserId && postAuthor.authorId === currentUserId
                ? () => social?.openHistory(item.post)
                : undefined
            }
            onReply={
              canCompose
                ? () =>
                    startReply({
                      postId: item.post.id,
                      name: postAuthor.name,
                      preview: liveQuotePreview(item.post) || 'Message',
                      avatarUrl: postAuthor.avatarUrl,
                      mention: mentionFromAuthor(item.post.author, item.post.author_id),
                    })
                : undefined
            }
          />
        </View>
      );
    },
    [canCompose, currentUserId, highlightPostId, onReact, posts, social, startEdit, startReply],
  );

  const composerPad = createStickyFooterPad(
    keyboardOpen,
    tabBarLift(insets.bottom, 'sticky') + Math.max(footerReserve, 0),
  );

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: THEME.background,
        marginBottom: keyboardOverlap,
      }}>
      {error && rows.length === 0 && !isLoading ? (
        <MascotState
          kind="error"
          title={copy('home.error')}
          actionLabel="Try again"
          onAction={onRetry}
        />
      ) : isLoading && rows.length === 0 ? (
        <MascotState kind="loading" title={loadingTitle ?? 'Loading Live'} compact />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (
              highlightPostId &&
              highlightPostId !== lastId &&
              highlightedOnce.current === highlightPostId
            ) {
              return;
            }
            listRef.current?.scrollToEnd({ animated: false });
          }}
          onScrollToIndexFailed={() => pinToLiveEdge(false)}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            gap: 12,
            paddingTop: 12,
            paddingBottom: 8,
            overflow: 'visible',
          }}
          ListEmptyComponent={
            <MascotState kind="empty" title={emptyTitle} body={emptyBody} compact />
          }
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(isRefreshing)}
                onRefresh={onRefresh}
                tintColor={THEME.accent}
              />
            ) : undefined
          }
          style={
            Platform.OS === 'web'
              ? ({ flex: 1, overflowY: 'auto', overflowX: 'hidden' } as object)
              : { flex: 1 }
          }
        />
      )}

      {canCompose ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            backgroundColor: THEME.background,
            paddingHorizontal: 10,
            paddingTop: 4,
            paddingBottom: composerPad,
          }}>
          {replyTo ? (
            <View
              className="flex-row items-center"
              style={{ gap: 8, minHeight: 28, marginBottom: 2 }}>
              {replyTo.avatarUrl ? (
                <Avatar uri={replyTo.avatarUrl} name={replyTo.name} size={16} />
              ) : null}
              <AppText
                className="text-[12px]"
                style={{ flex: 1, minWidth: 0, color: THEME.textMuted }}
                numberOfLines={1}>
                {liveQuoteLine(replyTo.name, replyTo.preview)}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                onPress={() => setReplyTo(null)}
                style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[16px] font-semibold" style={{ color: THEME.textMuted }}>
                  ×
                </AppText>
              </Pressable>
            </View>
          ) : editing ? (
            <View
              className="flex-row items-center"
              style={{ gap: 8, minHeight: 28, marginBottom: 2 }}>
              <AppText
                className="text-[12px]"
                style={{ flex: 1, minWidth: 0, color: THEME.textMuted }}
                numberOfLines={1}>
                {copy('live.edit')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
                onPress={() => setEditing(null)}
                style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[16px] font-semibold" style={{ color: THEME.textMuted }}>
                  ×
                </AppText>
              </Pressable>
            </View>
          ) : null}
          <InlineComposer
            key={editing ? `edit-${editing.id}` : replyTo ? `reply-${replyTo.postId}` : 'live'}
            bar
            autoFocus={Boolean(replyTo || editing)}
            placeholder={placeholder ?? copy('live.placeholder')}
            submitLabel={editing ? copy('live.save') : (sendLabel ?? copy('live.send'))}
            submitting={Boolean(composing || editPost.isPending)}
            audience={composeAudience}
            memberIds={memberIds}
            initialText={editing ? liveEditPrefill(editing) : undefined}
            replyTo={editing ? null : replyTo?.mention}
            onExpandedChange={(open) => {
              if (open) {
                pinToLiveEdge(false);
              }
            }}
            onSubmit={async (content, mentionedUserIds) => {
              try {
                await submitLine(content, mentionedUserIds, replyTo?.postId);
                setReplyTo(null);
              } catch (error) {
                Alert.alert('Couldn’t post that', getErrorMessage(error));
              }
            }}
          />
        </View>
      ) : (
        <View style={{ height: composerPad }} />
      )}
    </View>
  );
}

function mentionFromAuthor(
  author: PostWithMeta['author'],
  authorId?: string | null,
): MentionChip | null {
  const userId = safeUserId(author, authorId);
  const username = author?.username?.trim();
  if (!username && !userId) {
    return null;
  }
  return {
    userId: userId ?? username ?? '',
    username: username || userId || 'someone',
    label: authorLabel(author),
    visibleName: author?.display_name?.trim() || authorLabel(author),
  };
}

function commentAsLivePost(comment: CommentWithAuthor, parent: PostWithMeta): PostWithMeta {
  const authorId = safeUserId(comment.author, comment.author_id) ?? comment.author_id ?? '';
  return {
    id: comment.id,
    author_id: authorId,
    author: comment.author,
    challenge_id: parent.challenge_id,
    content: comment.content,
    media_urls: [],
    created_at: comment.created_at,
    mentions: comment.mentions,
    reactions: comment.reactions,
    comments: [],
    source: 'challenge',
    parent_id: parent.id,
  };
}
