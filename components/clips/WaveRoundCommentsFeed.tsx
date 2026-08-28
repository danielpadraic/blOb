import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { MentionText } from '@/components/feed/MentionText';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, PublicProfile, ReactionType } from '@/lib/types';
import { nestComments } from '@/utils/comments';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';

type ReplyHandler = (
  content: string,
  parentId?: string | null,
) => Promise<unknown> | void;

type WaveRoundCommentsFeedProps = {
  comments: CommentWithAuthor[];
  currentUserId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  submitting?: boolean;
  onSend: (content: string, parentId?: string | null) => Promise<unknown> | void;
  onReact?: (commentId: string, type: ReactionType) => void;
  onReport?: (commentId: string) => Promise<unknown> | void;
};

export function WaveRoundCommentsFeed({
  comments,
  currentUserId,
  avatarUrl,
  displayName,
  submitting,
  onSend,
  onReact,
  onReport,
}: WaveRoundCommentsFeedProps) {
  const [draft, setDraft] = useState('');
  const [local, setLocal] = useState<CommentWithAuthor[]>([]);
  const draftRef = useRef(draft);
  const scrollRef = useRef<ScrollView>(null);
  draftRef.current = draft;

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

  async function send(parentId?: string | null, textOverride?: string) {
    const text = (textOverride ?? draftRef.current).trim();
    if (!text || submitting) {
      return;
    }
    await onSend(text, parentId);
    const author = {
      display_name: displayName ?? 'You',
      username: displayName ?? 'you',
      avatar_url: avatarUrl ?? null,
    } as PublicProfile;
    setLocal((current) => [
      ...current,
      {
        id: `local-comment-${Date.now()}`,
        post_id: comments[0]?.post_id ?? '',
        author_id: currentUserId ?? 'me',
        parent_id: parentId ?? null,
        content: text,
        created_at: new Date().toISOString(),
        author,
      },
    ]);
    if (!parentId) {
      setDraft('');
    }
  }

  const body = (
    <View style={{ flex: 1, backgroundColor: THEME.surface }}>
      <View className="px-4 pt-3 pb-1">
        <AppText className="text-[15px] font-extrabold text-charcoal">{copy('clip.comments')}</AppText>
      </View>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 }}>
        {roots.length === 0 ? (
          <AppText className="mt-3 text-[14px] text-muted">{copy('clip.commentEmpty')}</AppText>
        ) : (
          roots.map((comment) => (
            <FeedItem
              key={comment.id}
              comment={comment}
              nested={false}
              currentUserId={currentUserId}
              submitting={submitting}
              onReply={(content, parentId) => send(parentId, content)}
              onReact={onReact}
              onReport={onReport}
            />
          ))
        )}
      </ScrollView>
      <SimpleComposer
        value={draft}
        onChange={setDraft}
        submitting={submitting}
        avatarUrl={avatarUrl}
        displayName={displayName}
        onSend={() => void send()}
      />
    </View>
  );

  if (Platform.OS === 'web') {
    return body;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      {body}
    </KeyboardAvoidingView>
  );
}

function FeedItem({
  comment,
  nested,
  currentUserId,
  submitting,
  onReply,
  onReact,
  onReport,
}: {
  comment: CommentWithAuthor;
  nested: boolean;
  currentUserId?: string;
  submitting?: boolean;
  onReply: ReplyHandler;
  onReact?: (commentId: string, type: ReactionType) => void;
  onReport?: (commentId: string) => Promise<unknown> | void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const name = comment.author?.display_name ?? comment.author?.username ?? 'blob';
  const handle = comment.author?.username ?? 'blob';
  const replies = comment.replies ?? [];

  return (
    <View
      className="mb-3 gap-1.5"
      style={
        nested
          ? {
              marginLeft: 12,
              borderLeftWidth: 2,
              borderLeftColor: THEME.accentSoft,
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
            <AppText className="text-[12px] font-semibold text-charcoal" numberOfLines={1}>
              {name}{' '}
              <AppText className="text-[11px] font-normal text-muted">@{handle}</AppText>
            </AppText>
          </ProfileLink>
          <MentionText content={comment.content} mentions={comment.mentions} className="text-[13px] leading-[18px] text-ink" />
          <AppText className="mt-0.5 text-[11px] text-muted">{formatFeedTime(comment.created_at)}</AppText>
          <View className="mt-0.5 flex-row items-center" style={{ gap: 8 }}>
            <ReactionBar
              compact
              reactions={comment.reactions}
              currentUserId={currentUserId}
              onReact={(type) => onReact?.(comment.id, type)}
              onReply={() => setReplyOpen((open) => !open)}
            />
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
                <AppText className="text-[11px] font-semibold text-muted">Report</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {replyOpen ? (
        <View style={{ marginLeft: nested ? 0 : 28 }}>
          <SimpleComposer
            value={replyDraft}
            onChange={setReplyDraft}
            submitting={submitting}
            placeholder={`Reply to ${name}`}
            onSend={async () => {
              const text = replyDraft.trim();
              if (!text) {
                return;
              }
              await onReply(text, comment.id);
              setReplyDraft('');
              setReplyOpen(false);
            }}
          />
        </View>
      ) : null}
      {replies.map((reply) => (
        <FeedItem
          key={reply.id}
          comment={reply}
          nested
          currentUserId={currentUserId}
          submitting={submitting}
          onReply={onReply}
          onReact={onReact}
          onReport={onReport}
        />
      ))}
    </View>
  );
}

function SimpleComposer({
  value,
  onChange,
  onSend,
  submitting,
  avatarUrl,
  displayName,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  submitting?: boolean;
  avatarUrl?: string | null;
  displayName?: string | null;
  placeholder?: string;
}) {
  const canSend = value.trim().length > 0 && !submitting;
  return (
    <View
      className="flex-row items-end px-3 py-2"
      style={{
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: THEME.border,
        backgroundColor: THEME.surface,
      }}>
      {avatarUrl !== undefined ? <Avatar uri={avatarUrl} name={displayName} size={32} /> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? copy('clip.comment')}
        placeholderTextColor={THEME.textMuted}
        multiline
        blurOnSubmit={false}
        editable={!submitting}
        accessibilityLabel={placeholder ?? copy('clip.comment')}
        style={{
          flex: 1,
          minHeight: 48,
          maxHeight: 96,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: THEME.background,
          color: THEME.textPrimary,
          fontSize: 15,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy('clip.commentSend')}
        disabled={!canSend}
        onPress={onSend}
        style={{
          minWidth: 48,
          minHeight: 48,
          paddingHorizontal: 14,
          borderRadius: 16,
          backgroundColor: THEME.accent,
          opacity: canSend ? 1 : 0.4,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <AppText className="text-[14px] font-extrabold" style={{ color: '#fff' }}>
          {copy('clip.commentSend')}
        </AppText>
      </Pressable>
    </View>
  );
}
