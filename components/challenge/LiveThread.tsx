import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveBubble } from '@/components/challenge/LiveBubble';
import { InlineComposer } from '@/components/feed/InlineComposer';
import { MascotState } from '@/components/mascot/MascotState';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { AppText } from '@/components/ui/AppText';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { copy } from '@/lib/copy';
import {
  LIVE_CHIP_DONE,
  LIVE_CHIP_STARTING,
  liveComposeFromInline,
  sortLivePosts,
} from '@/lib/liveThread';
import { tabBarLift, THEME } from '@/lib/theme';
import type { ComposeInput, PostWithMeta, ReactionType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

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
  commenting?: boolean;
  highlightPostId?: string;
  footerReserve?: number;
  onRefresh?: () => void;
  onRetry?: () => void;
  onCompose: (input: ComposeInput) => Promise<unknown> | void;
  onReact: (post: PostWithMeta, type: ReactionType, commentId?: string | null) => void;
  onComment?: (
    post: PostWithMeta,
    content: string,
    parentId?: string | null,
    mentionedUserIds?: string[],
  ) => Promise<unknown> | void;
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
  commenting,
  highlightPostId,
  footerReserve = 0,
  onRefresh,
  onRetry,
  onCompose,
  onReact,
  onComment,
}: LiveThreadProps) {
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const keyboardOpen = keyboardOverlap > 0;
  const listRef = useRef<FlatList<PostWithMeta>>(null);
  const highlightedOnce = useRef<string | null>(null);
  const livePosts = useMemo(() => sortLivePosts(posts), [posts]);
  const lastId = livePosts.at(-1)?.id;

  const pinToLiveEdge = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (livePosts.length === 0) {
      return;
    }
    if (
      highlightPostId &&
      highlightPostId !== lastId &&
      highlightedOnce.current !== highlightPostId
    ) {
      const index = livePosts.findIndex((post) => post.id === highlightPostId);
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
  }, [highlightPostId, lastId, livePosts, pinToLiveEdge]);

  const submitLine = useCallback(
    async (content: string, mentionedUserIds: string[] = []) => {
      const split = liveComposeFromInline(content);
      if (!split.text && split.mediaUrls.length === 0) {
        return;
      }
      await onCompose({
        content: split.text,
        mediaUrls: split.mediaUrls,
        source: 'challenge',
        audience: 'public',
        mentionedUserIds,
      });
      pinToLiveEdge(true);
    },
    [onCompose, pinToLiveEdge],
  );

  const submitChip = useCallback(
    async (line: string) => {
      if (composing) {
        return;
      }
      try {
        await submitLine(line);
      } catch (error) {
        Alert.alert('Couldn’t post that', getErrorMessage(error));
      }
    },
    [composing, submitLine],
  );

  const renderItem = useCallback(
    ({ item }: { item: PostWithMeta }) => (
      <View style={{ paddingHorizontal: 16 }}>
        <LiveBubble
          post={item}
          currentUserId={currentUserId}
          highlighted={highlightPostId === item.id}
          commenting={commenting}
          onReact={(type, commentId) => onReact(item, type, commentId)}
          onComment={
            onComment
              ? (content, parentId, mentionedUserIds) =>
                  onComment(item, content, parentId, mentionedUserIds)
              : undefined
          }
        />
      </View>
    ),
    [commenting, currentUserId, highlightPostId, onComment, onReact],
  );

  const composerPad = createStickyFooterPad(
    keyboardOpen,
    tabBarLift(insets.bottom, 'sticky') + 8 + Math.max(footerReserve, 0),
  );

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: THEME.background,
        marginBottom: keyboardOverlap,
      }}>
      {error && livePosts.length === 0 && !isLoading ? (
        <MascotState
          kind="error"
          title={copy('home.error')}
          actionLabel="Try again"
          onAction={onRetry}
        />
      ) : isLoading && livePosts.length === 0 ? (
        <MascotState kind="loading" title="Loading Live" compact />
      ) : (
        <FlatList
          ref={listRef}
          data={livePosts}
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
            paddingBottom: 12,
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
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: composerPad,
          }}>
          <View className="mb-2 flex-row" style={{ gap: 8 }}>
            <LiveChip
              label={LIVE_CHIP_STARTING}
              disabled={Boolean(composing)}
              onPress={() => void submitChip(LIVE_CHIP_STARTING)}
            />
            <LiveChip
              label={LIVE_CHIP_DONE}
              disabled={Boolean(composing)}
              onPress={() => void submitChip(LIVE_CHIP_DONE)}
            />
          </View>
          <InlineComposer
            pinned
            autoFocus={false}
            placeholder={copy('live.placeholder')}
            submitLabel={copy('live.send')}
            submitting={composing}
            audience="public"
            onSubmit={async (content, mentionedUserIds) => {
              try {
                await submitLine(content, mentionedUserIds);
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

const LiveChip = memo(function LiveChip({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: THEME.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}>
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
        {label}
      </AppText>
    </Pressable>
  );
});
