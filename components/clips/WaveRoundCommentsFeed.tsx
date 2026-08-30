import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { MentionField } from '@/components/feed/MentionField';
import { MentionText } from '@/components/feed/MentionText';
import { OfficialMark } from '@/components/profile/OfficialMark';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { CLIP_REACTIONS, DEFAULT_CLIP_REACTION, clipReactionEmoji } from '@/lib/clipReactions';
import { copy } from '@/lib/copy';
import type { MentionChip, MentionDoc } from '@/lib/mentions';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, PublicProfile, ReactionType } from '@/lib/types';
import { nestComments } from '@/utils/comments';
import { getErrorMessage } from '@/utils/errors';
import { formatFeedTime } from '@/utils/format';
import { userReaction } from '@/lib/reactions';

const NAME = 'rgba(255,255,255,0.72)';
const TIME = 'rgba(255,255,255,0.5)';
const BODY = 'rgba(245,245,245,0.96)';
const ICON = 'rgba(245,245,245,0.9)';
const FOOTER = 'footer';

type ReplyTarget = {
  id: string;
  name: string;
  mention: MentionChip | null;
};

type WaveRoundCommentsFeedProps = {
  comments: CommentWithAuthor[];
  currentUserId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  submitting?: boolean;
  audience?: string;
  audienceUserIds?: string[];
  keyboardInset?: number;
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
  audience = 'public',
  audienceUserIds = [],
  keyboardInset = 0,
  onSend,
  onReact,
  onReport,
  onClose,
  onScrollOffset,
  onCloseFromTop,
}: WaveRoundCommentsFeedProps) {
  const [local, setLocal] = useState<CommentWithAuthor[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [docs, setDocs] = useState<Record<string, MentionDoc>>({});
  const seededReply = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollTop = useRef(0);
  const topSwipes = useRef(0);
  const sentCount = useRef(0);

  const thread = [...comments];
  for (const row of local) {
    if (
      !thread.some(
        (comment) =>
          comment.id === row.id ||
          (comment.content === row.content &&
            (comment.author_id === row.author_id ||
              Boolean(currentUserId && comment.author_id === currentUserId))),
      )
    ) {
      thread.push(row);
    }
  }
  const roots = nestComments(thread);
  const slot = replyTo?.id ?? FOOTER;

  useEffect(() => {
    if (thread.length <= sentCount.current) {
      return undefined;
    }
    sentCount.current = thread.length;
    const handle = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(handle);
  }, [thread.length]);

  useEffect(() => {
    if (!replyTo || Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }
    const handle = requestAnimationFrame(() => {
      document.getElementById('blob-reply-composer')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(handle);
  }, [replyTo?.id]);

  function setSlotDoc(id: string, doc: MentionDoc) {
    setDocs((current) => (current[id] === doc ? current : { ...current, [id]: doc }));
  }

  function openReply(target: ReplyTarget) {
    setReplyTo(target);
    if (seededReply.current === target.id) {
      return;
    }
    seededReply.current = target.id;
    setDocs((current) => {
      if ((current[target.id]?.text ?? '').trim()) {
        return current;
      }
      const handle = target.mention?.username?.replace(/^@/, '');
      if (!handle) {
        return current;
      }
      return {
        ...current,
        [target.id]: {
          text: `@${handle} `,
          chips: target.mention ? [target.mention] : [],
        },
      };
    });
  }

  async function send(id: string, parentId: string | null) {
    const doc = docs[id] ?? { text: '', chips: [] };
    const body = doc.text.trim();
    if (!body || submitting) {
      return;
    }
    const mentioned = [
      ...new Set([
        ...doc.chips.map((chip) => chip.userId),
        ...(parentId && replyTo?.mention?.userId ? [replyTo.mention.userId] : []),
      ]),
    ];
    await onSend(body, parentId, mentioned);
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
        content: body,
        created_at: new Date().toISOString(),
        author,
      },
    ]);
    setDocs((current) => ({ ...current, [id]: { text: '', chips: [] } }));
    setReplyTo(null);
    seededReply.current = null;
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

  const composer = (
    <FrostComposer
      slot={slot}
      doc={docs[slot] ?? { text: '', chips: [] }}
      onDoc={(doc) => setSlotDoc(slot, doc)}
      seedMention={slot !== FOOTER ? replyTo?.mention ?? null : null}
      audience={audience}
      audienceUserIds={audienceUserIds}
      excludeIds={currentUserId ? [currentUserId] : []}
      submitting={submitting}
      keyboardInset={keyboardInset}
      onCancel={replyTo ? () => setReplyTo(null) : undefined}
      onSend={() => void send(slot, replyTo?.id ?? null)}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Pressable
        onPress={() => {
          if (replyTo) {
            setReplyTo(null);
          }
        }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 2 }}>
        <AppText className="flex-1 text-[15px] font-extrabold" style={{ color: '#fff' }}>
          {copy('clip.comments')}
        </AppText>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close comments"
            onPress={onClose}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <AppText className="text-[22px] font-bold" style={{ color: '#fff' }}>
              ×
            </AppText>
          </Pressable>
        ) : null}
      </Pressable>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8, flexGrow: 1 }}
        scrollEventThrottle={16}
        onScroll={noteScroll}
        onScrollEndDrag={tryCloseFromTop}
        onMomentumScrollEnd={tryCloseFromTop}>
        {roots.length === 0 ? (
          <AppText className="mt-3 text-[13px]" style={{ color: ICON }}>
            {copy('clip.commentEmpty')}
          </AppText>
        ) : (
          roots.map((comment) => (
            <FeedItem
              key={comment.id}
              comment={comment}
              nested={false}
              currentUserId={currentUserId}
              replyTo={replyTo}
              composer={replyTo?.id === comment.id ? composer : null}
              onReply={openReply}
              onReact={onReact}
              onReport={onReport}
            />
          ))
        )}
      </ScrollView>
      {!replyTo ? composer : null}
    </View>
  );
}

function FeedItem({
  comment,
  nested,
  currentUserId,
  replyTo,
  composer,
  onReply,
  onReact,
  onReport,
}: {
  comment: CommentWithAuthor;
  nested: boolean;
  currentUserId?: string;
  replyTo: ReplyTarget | null;
  composer: ReactNode;
  onReply: (target: ReplyTarget) => void;
  onReact?: (commentId: string, type: ReactionType) => void;
  onReport?: (commentId: string) => Promise<unknown> | void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const name = comment.author?.display_name ?? comment.author?.username ?? 'blob';
  const handle = comment.author?.username ?? '';
  const replies = comment.replies ?? [];
  const mine = userReaction(comment.reactions, currentUserId);
  const count = comment.reactions?.length ?? 0;

  return (
    <View
      style={{
        marginBottom: 7,
        marginLeft: nested ? 14 : 0,
        paddingLeft: nested ? 8 : 0,
        borderLeftWidth: nested ? 1.5 : 0,
        borderLeftColor: nested ? 'rgba(255,255,255,0.18)' : 'transparent',
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <ProfileLink username={comment.author?.username} userId={comment.author_id}>
          <Avatar uri={comment.author?.avatar_url} name={name} size={22} />
        </ProfileLink>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <ProfileLink username={comment.author?.username} userId={comment.author_id}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 0, flexShrink: 1 }}>
                <AppText
                  className="text-[13px] font-semibold"
                  style={{ color: NAME }}
                  numberOfLines={1}>
                  {name}
                </AppText>
                <OfficialMark profile={comment.author} compact />
              </View>
            </ProfileLink>
            <AppText className="text-[10px]" style={{ color: TIME }} numberOfLines={1}>
              {formatFeedTime(comment.created_at)}
            </AppText>
          </View>
          <View style={{ marginTop: 4 }}>
            <MentionText
              content={comment.content}
              mentions={comment.mentions}
              color={BODY}
              className="text-[13px] leading-[18px] font-normal"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 30, marginTop: 2, gap: 4 }}>
            {onReact ? (
              <View style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' }}>
                {pickerOpen ? (
                  <View
                    pointerEvents="auto"
                    style={{
                      position: 'absolute',
                      left: 0,
                      bottom: 32,
                      backgroundColor: 'rgba(16,19,18,0.28)',
                      borderRadius: 18,
                      paddingVertical: 4,
                      zIndex: 6,
                    }}>
                    {CLIP_REACTIONS.map((row) => (
                      <Pressable
                        key={row.type}
                        accessibilityRole="button"
                        accessibilityLabel={row.label}
                        onPress={() => {
                          onReact(comment.id, row.type);
                          setPickerOpen(false);
                        }}
                        style={{
                          minWidth: 30,
                          minHeight: 30,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <AppText className="text-[18px]">{row.emoji}</AppText>
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close reactions"
                      onPress={() => setPickerOpen(false)}
                      style={{ minHeight: 28, alignItems: 'center', justifyContent: 'center' }}>
                      <AppText className="text-[11px] font-bold" style={{ color: ICON }}>
                        ×
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Love comment"
                  onPress={() => onReact(comment.id, mine?.reaction_type ?? DEFAULT_CLIP_REACTION)}
                  onLongPress={() => setPickerOpen(true)}
                  delayLongPress={280}
                  style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' }}>
                  <AppText className="text-[16px]" style={{ color: mine ? '#fff' : ICON }}>
                    {mine ? clipReactionEmoji(mine.reaction_type) : '♡'}
                  </AppText>
                </Pressable>
              </View>
            ) : null}
            {count > 0 ? (
              <AppText className="text-[11px]" style={{ color: ICON, marginRight: 4 }}>
                {count}
              </AppText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${name}`}
              onPress={() =>
                onReply({
                  id: comment.id,
                  name,
                  mention: handle
                    ? { userId: comment.author_id, username: handle, label: name, kind: 'user' }
                    : null,
                })
              }
              style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 }}>
              <AppText className="text-[16px]" style={{ color: ICON }}>
                ↩
              </AppText>
              {replies.length > 0 ? (
                <AppText className="text-[11px]" style={{ color: ICON }}>
                  {replies.length}
                </AppText>
              ) : null}
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
                style={{ minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[14px]" style={{ color: ICON }}>
                  ⚑
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {replyTo?.id === comment.id ? (
        <View nativeID="blob-reply-composer" style={{ marginLeft: 30, marginTop: 4 }}>
          {composer}
        </View>
      ) : null}
      {replies.map((reply) => (
        <FeedItem
          key={reply.id}
          comment={reply}
          nested
          currentUserId={currentUserId}
          replyTo={replyTo}
          composer={replyTo?.id === reply.id ? composer : null}
          onReply={onReply}
          onReact={onReact}
          onReport={onReport}
        />
      ))}
    </View>
  );
}

function FrostComposer({
  slot,
  doc,
  onDoc,
  seedMention,
  audience,
  audienceUserIds,
  excludeIds,
  submitting,
  keyboardInset,
  onSend,
  onCancel,
}: {
  slot: string;
  doc: MentionDoc;
  onDoc: (doc: MentionDoc) => void;
  seedMention?: MentionChip | null;
  audience: string;
  audienceUserIds: string[];
  excludeIds: string[];
  submitting?: boolean;
  keyboardInset: number;
  onSend: () => void;
  onCancel?: () => void;
}) {
  return (
    <View
      style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 + Math.max(0, keyboardInset), gap: 4 }}>
      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel reply"
          onPress={onCancel}
          style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' }}>
          <AppText className="text-[11px]" style={{ color: ICON }}>
            Cancel
          </AppText>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View
          style={{
            flex: 1,
            minHeight: 40,
            borderRadius: 14,
            paddingHorizontal: 10,
            paddingVertical: 2,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}>
          <MentionField
            compact
            autoFocus={slot !== FOOTER}
            pickerPlacement="above"
            tone="frost"
            initialText={doc.text}
            initialMention={doc.text.trim() ? null : seedMention}
            audience={audience}
            audienceUserIds={audienceUserIds}
            excludeIds={excludeIds}
            placeholder={copy('clip.comment')}
            accessibilityLabel={copy('clip.comment')}
            onChange={onDoc}
            onSubmit={onSend}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('clip.commentSend')}
          disabled={!doc.text.trim() || submitting}
          onPress={onSend}
          style={{
            minWidth: 48,
            minHeight: 40,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: THEME.accent,
            opacity: doc.text.trim() && !submitting ? 1 : 0.4,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText className="text-[13px] font-extrabold" style={{ color: '#fff' }}>
            {copy('clip.commentSend')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
