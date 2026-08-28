import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { commentSheetHeight } from '@/lib/clipWatch';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { CommentWithAuthor, PublicProfile } from '@/lib/types';
import { formatFeedTime } from '@/utils/format';

type WaveRoundCommentSheetProps = {
  visible: boolean;
  comments: CommentWithAuthor[];
  viewportHeight: number;
  avatarUrl?: string | null;
  displayName?: string | null;
  authorId?: string | null;
  submitting?: boolean;
  onClose: () => void;
  onSend: (content: string) => Promise<unknown> | void;
};

export function WaveRoundCommentSheet({
  visible,
  comments,
  viewportHeight,
  avatarUrl,
  displayName,
  authorId,
  submitting,
  onClose,
  onSend,
}: WaveRoundCommentSheetProps) {
  const [draft, setDraft] = useState('');
  const [local, setLocal] = useState<CommentWithAuthor[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const thread = [...comments];
  for (const row of local) {
    if (
      !thread.some(
        (comment) =>
          comment.id === row.id ||
          (comment.content === row.content &&
            (comment.author_id === row.author_id || Boolean(authorId && comment.author_id === authorId))),
      )
    ) {
      thread.push(row);
    }
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    const handle = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(handle);
  }, [comments.length, local.length, visible]);

  if (!visible) {
    return null;
  }

  const sheetH = commentSheetHeight(viewportHeight || 420);
  const canSend = draft.trim().length > 0 && !submitting;

  async function send() {
    const text = draftRef.current.trim();
    if (!text || submitting) {
      return;
    }
    await onSend(text);
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
        author_id: authorId ?? 'me',
        content: text,
        created_at: new Date().toISOString(),
        author,
      },
    ]);
    setDraft('');
  }

  const sheet = (
    <View
      style={{
        height: sheetH,
        maxHeight: sheetH,
        minHeight: Math.min(168, sheetH),
        backgroundColor: THEME.surface,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
      }}>
      <View className="items-center pt-2">
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: THEME.border }} />
      </View>
      <View className="flex-row items-center justify-between px-4">
        <AppText className="text-[15px] font-extrabold text-charcoal">{copy('clip.comments')}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close comments"
          onPress={onClose}
          hitSlop={8}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
          <AppText className="text-[18px] font-bold text-muted">×</AppText>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, flexGrow: 1 }}>
        {thread.length === 0 ? (
          <AppText className="mt-2 text-[14px] text-muted">{copy('clip.commentEmpty')}</AppText>
        ) : (
          thread.map((comment) => {
            const name = comment.author?.display_name ?? comment.author?.username ?? 'blob';
            return (
              <View key={comment.id} className="mb-3 flex-row gap-2">
                <Avatar uri={comment.author?.avatar_url} name={name} size={28} />
                <View className="min-w-0 flex-1">
                  <AppText className="text-[13px] font-bold text-charcoal" numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText className="text-[14px] leading-5 text-ink">{comment.content}</AppText>
                  <AppText className="mt-0.5 text-[11px] text-muted">
                    {formatFeedTime(comment.created_at)}
                  </AppText>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <View
        className="flex-row items-end px-3 py-2"
        style={{
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: THEME.border,
          backgroundColor: THEME.surface,
        }}>
        <Avatar uri={avatarUrl} name={displayName} size={32} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={copy('clip.comment')}
          placeholderTextColor={THEME.textMuted}
          multiline
          blurOnSubmit={false}
          editable={!submitting}
          accessibilityLabel={copy('clip.comment')}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 88,
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
          onPress={() => void send()}
          style={{
            minWidth: 44,
            minHeight: 44,
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
    </View>
  );

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close comments"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(16,19,18,0.4)' }}
      />
      {Platform.OS === 'web' ? (
        sheet
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {sheet}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
