import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AudienceIconButton, AudienceSheet } from '@/components/feed/AudienceSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { useCreatePost } from '@/hooks/useFeed';
import { copy } from '@/lib/copy';
import {
  allowedShareAudiences,
  canShareRoundToFeed,
  clampShareAudience,
  clampShareAudienceUserIds,
  snapshotFromRound,
} from '@/lib/roundShare';
import { asPostAudience, audienceLabel, type PostAudience } from '@/lib/postAudience';
import { feedHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export type RoundShareTarget = {
  kind?: 'wave' | 'round';
  reelId?: string;
  storyId?: string;
  postId: string;
  mediaUrl: string;
  coverUrl?: string | null;
  caption?: string | null;
  authorId: string;
  authorName: string;
  username?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  audience?: string | null;
  audienceUserIds?: string[];
  challengeId?: string | null;
  privacyMode?: string | null;
};

export function RoundShareComposer({
  visible,
  target,
  onClose,
}: {
  visible: boolean;
  target: RoundShareTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createPost = useCreatePost();
  const [comment, setComment] = useState('');
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roundAudience = asPostAudience(target?.audience);
  const allowed = allowedShareAudiences(roundAudience);
  const [audience, setAudience] = useState<PostAudience>(
    allowed.includes('friends') ? 'friends' : allowed[0] ?? 'friends',
  );
  const [audienceUserIds, setAudienceUserIds] = useState<string[]>([]);
  const shareKind = target?.kind ?? (target?.storyId && !target?.reelId ? 'wave' : 'round');
  const canPublish = comment.trim().length > 0 && Boolean(target?.postId);
  const blocked = !target || !canShareRoundToFeed(target.privacyMode);

  const cover = target?.coverUrl || target?.mediaUrl || null;

  const options = useMemo(
    () => allowed.map((value) => ({ value, label: audienceLabel(value) })),
    [allowed],
  );

  async function publish() {
    if (!target || !canPublish || blocked) {
      return;
    }
    const nextAudience = clampShareAudience(roundAudience, audience);
    const nextIds = clampShareAudienceUserIds(
      roundAudience,
      target.audienceUserIds,
      nextAudience === 'specific' ? audienceUserIds : [],
    );
    if (nextAudience === 'specific' && nextIds.length === 0) {
      setError('Pick at least one person.');
      return;
    }
    setError(null);
    try {
      const created = await createPost.mutateAsync({
        content: comment.trim(),
        mediaUrls: [],
        audience: nextAudience,
        audienceUserIds: nextIds,
        challengeId: undefined,
        source: 'share',
        type: shareKind === 'wave' ? 'wave_share' : 'round_share',
        parentId: target.postId,
        quotedPostId: target.postId,
        quoteSnapshot: snapshotFromRound({
          kind: shareKind,
          reelId: target.reelId,
          storyId: target.storyId,
          authorId: target.authorId,
          authorName: target.authorName,
          username: target.username,
          avatarUrl: target.avatarUrl,
          caption: target.caption,
          coverUrl: cover,
          createdAt: target.createdAt,
          audience: target.audience,
        }),
      });
      onClose();
      setComment('');
      void queryClient.invalidateQueries({ queryKey: ['clip-shares', target.postId] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      router.replace(feedHref(created.id));
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  if (blocked) {
    return null;
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} dim="heavy" zIndex={50}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 20,
        }}>
        <View className="flex-row items-center justify-between">
          <AppText className="text-[16px] font-extrabold text-charcoal">
            {copy('clip.repostFeedTitle')}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
            <AppText className="text-[18px] font-bold text-muted">×</AppText>
          </Pressable>
        </View>

        <View
          className="mt-3 items-center justify-center overflow-hidden"
          style={{
            height: 180,
            borderRadius: 18,
            backgroundColor: THEME.primary,
          }}>
          {cover ? (
            <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          ) : (
            <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
              {copy('round.noun')}
            </AppText>
          )}
        </View>

        <View className="mt-3">
          <Input
            placeholder={copy('clip.repostPlaceholder')}
            value={comment}
            onChangeText={setComment}
            grow
            growMaxLines={4}
          />
        </View>

        <View className="mt-3 flex-row items-center justify-between">
          <AppText className="text-[13px] font-semibold text-muted">
            {options.find((row) => row.value === audience)?.label ?? audienceLabel(audience)}
          </AppText>
          <AudienceIconButton audience={audience} onPress={() => setAudienceOpen(true)} />
        </View>

        {error ? (
          <AppText className="mt-2 text-[13px]" style={{ color: THEME.danger }}>
            {error}
          </AppText>
        ) : null}

        <View className="mt-4">
          <Button
            title={copy('create.publish')}
            disabled={!canPublish || createPost.isPending}
            loading={createPost.isPending}
            onPress={() => void publish()}
          />
        </View>
        {createPost.isPending ? (
          <ActivityIndicator className="mt-2" color={THEME.accent} />
        ) : null}
      </View>

      {audienceOpen ? (
        <AudienceSheet
          draft={{
            audience,
            audienceUserIds,
            allowPublic: allowed.includes('public'),
            allowFriends: allowed.includes('friends'),
            allowedUserIds:
              roundAudience === 'specific' ? target?.audienceUserIds : undefined,
            onSave: (next, ids) => {
              setAudience(clampShareAudience(roundAudience, next));
              setAudienceUserIds(
                clampShareAudienceUserIds(roundAudience, target?.audienceUserIds, ids),
              );
            },
          }}
          onClose={() => setAudienceOpen(false)}
        />
      ) : null}
    </ChromeOverlay>
  );
}
