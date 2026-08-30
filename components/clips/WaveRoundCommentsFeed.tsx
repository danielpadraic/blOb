import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { MentionText } from '@/components/feed/MentionText';
import { OfficialMark } from '@/components/profile/OfficialMark';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, PublicProfile, ReactionType } from '@/lib/types';
import { nestComments } from '@/utils/comments';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';

type WaveRoundCommentsFeedProps = {
  comments: CommentWithAuthor[];
  currentUserId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  submitting?: boolean;
  onSend: (
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
  onReact?: (commentId: string, type: ReactionType) => void;
  onReport?: (commentId: string) => Promise<unknown> | void;
  onClose?: () => void;
  onScrollOffset?: (offset: number) => void;
  onCloseFromTop?: () => void;
};

export function WaveRoundCommentsFeed({
  comments,
  currentUserId,
  displayName,
  submitting,
  onSend,
  onReact,
  onReport,
  onClose,
  onScrollOffset,
  onCloseFromTop,
}: WaveRoundCommentsFeedProps) {
  const [local, setLocal] = useState<CommentWithAuthor[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const scrollTop = useRef(0);
  const topSwipes = useRef(0);

  const thread = [...comments];
  for (const row of local) {
    if (
      !thread.some(
        (comment) =>
          comment.id === row.id ||
          (comment.content === row.content &&
            (comment.author_id === row.author_id || Boolean(currentUserId && comment.author_id === currentUserId))),
      )
    ) {
      thread.push(row);
    }
  }
  const roots = nestComments(thread);

  useEffect(() => {
    const handle = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(handle);
  }, [thread.length]);

  async function send() {
    const text = draft.trim();
    if (!text || submitting) {
      return;
    }
    const parentId = replyTo?.id ?? null;
    await onSend(text, parentId, []);
    const author = {
      display_name: displayName ?? 'You',
      username: displayName ?? 'you',
      avatar_url: null,
    } as PublicProfile;
    setLocal((current) => [
      ...current,
      {
        id: `local-comment-${Date.now()}`,
        post_id: comments[0]?.post_id ?? '',
        author_id: currentUserId ?? 'me',
        parent_id: parentId,
        content: text,
        created_at: new Date().toISOString(),
        author,
      },
    ]);
    setDraft('');
    setReplyTo(null);
  }

  function noteScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    scrollTop.current = y;
    onScrollOffset?.(y);
    if (y > 4) {
      topSwipes.current = 0;
    }
  }

  function tryCloseFromTop(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const vy = event.nativeEvent.velocity?.y ?? 0;
    if (y > 2) {
      return;
    }
    topSwipes.current += 1;
    if (topSwipes.current >= 2 || vy > 0.55) {
      topSwipes.current = 0;
      onCloseFromTop?.();
    }
  }

  const ink = '#fff';
  const muted = 'rgba(255,255,255,0.62)';

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View className="flex-row items-center px-4 pt-1 pb-1">
        <AppText className="flex-1 text-[15px] font-extrabold" style={{ color: ink }}>
          {copy('clip.comments')}
        </AppText>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close comments"
            onPress={onClose}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <AppText className="text-[22px] font-bold" style={{ color: ink }}>
              ×
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 }}
        scrollEventThrottle={16}
        onScroll={noteScroll}
        onScrollEndDrag={tryCloseFromTop}
        onMomentumScrollEnd={tryCloseFromTop}>
        {roots.length === 0 ? (
          <AppText className="mt-3 text-[14px]" style={{ color: muted }}>
            {copy('clip.commentEmpty')}
          </AppText>
        ) : (
          roots.map((comment) => (
            <FeedItem
              key={comment.id}
              comment={comment}
              nested={false}
              currentUserId={currentUserId}
              ink={ink}
              muted={muted}
              onReply={(id, name) => setReplyTo({ id, name })}
              onReact={onReact}
              onReport={onReport}
            />
          ))
        )}
      </ScrollView>
      {replyTo ? (
        <Pressable
          onPress={() => setReplyTo(null)}
          style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <AppText className="text-[12px]" style={{ color: muted }}>
            Replying to {replyTo.name} · tap to cancel
          </AppText>
        </Pressable>
      ) : null}
      <View
        className="flex-row items-end px-3 py-2"
        style={{ gap: 8, backgroundColor: 'transparent' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={copy('clip.comment')}
          placeholderTextColor={muted}
          multiline
          accessibilityLabel={copy('clip.comment')}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 96,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: ink,
            fontSize: 15,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('clip.commentSend')}
          disabled={!draft.trim() || submitting}
          onPress={() => void send()}
          style={{
            minWidth: 48,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 16,
            backgroundColor: THEME.accent,
            opacity: draft.trim() && !submitting ? 1 : 0.4,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText className="text-[14px] font-extrabold" style={{ color: '#fff' }}>
            {copy('clip.commentSend')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function FeedItem({
  comment,
  nested,
  currentUserId,
  ink,
  muted,
  onReply,
  onReact,
  onReport,
}: {
  comment: CommentWithAuthor;
  nested: boolean;
  currentUserId?: string;
  ink: string;
  muted: string;
  onReply: (id: string, name: string) => void;
  onReact?: (commentId: string, type: ReactionType) => void;
  onReport?: (commentId: string) => Promise<unknown> | void;
}) {
  const name = comment.author?.display_name ?? comment.author?.username ?? 'blob';
  const replies = comment.replies ?? [];

  return (
    <View
      className="mb-3 gap-1.5"
      style={
        nested
          ? {
              marginLeft: 12,
              borderLeftWidth: 2,
              borderLeftColor: 'rgba(255,255,255,0.22)',
              paddingLeft: 8,
            }
          : undefined
      }>
      <View className="flex-row gap-2">
        <ProfileLink username={comment.author?.username} userId={comment.author_id}>
          <Avatar uri={comment.author?.avatar_url} name={name} size={nested ? 20 : 24} />
        </ProfileLink>
        <View className="min-w-0 flex-1">
          <ProfileLink username={comment.author?.username} userId={comment.author_id}>
            <View className="flex-row items-center" style={{ gap: 4, minWidth: 0 }}>
              <AppText className="text-[12px] font-semibold" style={{ color: ink }} numberOfLines={1}>
                {name}
              </AppText>
              <OfficialMark profile={comment.author} compact />
            </View>
          </ProfileLink>
          <MentionText
            content={comment.content}
            mentions={comment.mentions}
            className="text-[13px] leading-[18px] text-white"
          />
          <AppText className="mt-0.5 text-[11px]" style={{ color: muted }}>
            {formatFeedTime(comment.created_at)}
          </AppText>
          <View className="mt-0.5 flex-row items-center" style={{ gap: 12 }}>
            {onReact ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Love comment"
                onPress={() => onReact(comment.id, 'love')}
                style={{ minHeight: 32, justifyContent: 'center' }}>
                <AppText className="text-[12px] font-semibold" style={{ color: muted }}>
                  ♡
                </AppText>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${name}`}
              onPress={() => onReply(comment.id, name)}
              style={{ minHeight: 32, justifyContent: 'center' }}>
              <AppText className="text-[12px] font-semibold" style={{ color: muted }}>
                Reply
              </AppText>
            </Pressable>
            {onReport ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Report comment"
                onPress={() => {
                  void Promise.resolve(onReport(comment.id)).catch((error: unknown) =>
                    Alert.alert('Couldn’t report that', getErrorMessage(error)),
                  );
                }}
                style={{ minHeight: 32, justifyContent: 'center' }}>
                <AppText className="text-[11px] font-semibold" style={{ color: muted }}>
                  Report
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {replies.map((reply) => (
        <FeedItem
          key={reply.id}
          comment={reply}
          nested
          currentUserId={currentUserId}
          ink={ink}
          muted={muted}
          onReply={onReply}
          onReact={onReact}
          onReport={onReport}
        />
      ))}
    </View>
  );
}
