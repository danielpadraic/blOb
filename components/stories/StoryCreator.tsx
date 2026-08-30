import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCreatePost } from '@/hooks/useFeed';
import { useCreateFeedEvent, useCreateStory, useStoryChallengeOptions } from '@/hooks/useSocial';
import { attachClipPostId } from '@/lib/social';
import { copy } from '@/lib/copy';
import { publishedRowId, waveHref } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';
import { uploadPosterFromVideo } from '@/lib/videoPoster';
import { getErrorMessage } from '@/utils/errors';
import { uploadStoryMedia } from '@/utils/upload';

type Draft = {
  uri: string;
  mediaType: 'image' | 'video';
  mimeType?: string | null;
  blob?: Blob | null;
};

type StoryCreatorProps = {
  onClose?: () => void;
  onPosted?: (storyId: string) => void;
};

export function StoryCreator({ onClose, onPosted }: StoryCreatorProps) {
  const router = useRouter();
  const { user } = useAuth();
  const createStory = useCreateStory();
  const createPost = useCreatePost();
  const createFeedEvent = useCreateFeedEvent();
  const challenges = useStoryChallengeOptions();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const posting = createStory.isPending || progress > 0;
  const challengeOptions = challenges.data ?? [];
  const selectedChallenge = useMemo(
    () => challengeOptions.find((row) => row.id === challengeId) ?? null,
    [challengeId, challengeOptions],
  );

  function close() {
    if (onClose) {
      onClose();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  }

  async function pick(mediaTypes: Array<'images' | 'videos'>) {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        copy('wave.library'),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.8,
      allowsEditing: false,
      videoMaxDuration: 30,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }
    const asset = result.assets[0];
    setDraft({
      uri: asset.uri,
      mediaType: mediaTypes.includes('videos') ? 'video' : 'image',
      mimeType: asset.mimeType ?? asset.file?.type,
      blob: asset.file ?? null,
    });
  }

  async function publish() {
    if (!draft || posting) {
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in first', copy('wave.signIn'));
      return;
    }
    setError(null);
    setProgress(12);
    const tick = setInterval(() => {
      setProgress((value) => (value > 0 && value < 82 ? Math.min(82, value + 6) : value));
    }, 180);
    try {
      const mediaUrl = await uploadStoryMedia({
        uri: draft.uri,
        userId: user.id,
        mimeType: draft.mimeType,
        blob: draft.blob,
      });
      setProgress(88);
      const posterUrl =
        draft.mediaType === 'video'
          ? await uploadPosterFromVideo({
              videoUri: draft.uri,
              userId: user.id,
              fileStem: `stories/${Date.now()}-poster`,
            })
          : null;
      const stories = await createStory.mutateAsync({
        media_url: mediaUrl,
        media_type: draft.mediaType,
        thumbnail_url: posterUrl,
        caption: caption.trim() || null,
        challenge_id: challengeId,
      });
      const story = stories[0];
      const storyId = publishedRowId(story) ?? publishedRowId(stories);
      setProgress(100);
      if (!storyId) {
        setError('Couldn’t open that clip');
        return;
      }
      if (story) {
        try {
          const posted = await createPost.mutateAsync({
            content: caption.trim(),
            mediaUrls: [mediaUrl],
            challengeId: challengeId ?? undefined,
            source: 'feed',
            type: 'wave',
          });
          const postedId = publishedRowId(posted);
          if (postedId) {
            await attachClipPostId('story', storyId, postedId);
          }
        } catch {
          // The Wave is live even if the feed card does not land.
        }
        try {
          await createFeedEvent.mutateAsync({
            event_type: 'story_posted',
            target_type: 'story',
            target_id: storyId,
            challenge_id: story.challenge_id,
            metadata: { media_type: story.media_type },
          });
        } catch {
          // The Wave is live even if the activity card does not land.
        }
      }
      onPosted?.(storyId);
      router.replace(waveHref(storyId, { from: 'home' }));
    } catch (caught) {
      clearInterval(tick);
      setProgress(0);
      setError(getErrorMessage(caught));
    } finally {
      clearInterval(tick);
    }
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 pb-8"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <AppText className="text-[22px] font-bold text-charcoal">{copy('wave.new')}</AppText>
          <AppText className="mt-1 text-[14px] text-muted">
            A photo or 30-second clip. It disappears in 24 hours.
          </AppText>
        </View>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border }}>
          <AppText className="text-[18px] font-semibold text-muted">×</AppText>
        </Pressable>
      </View>

      {draft ? (
        <Card padded={false} className="overflow-hidden">
          {draft.mediaType === 'image' ? (
            <Image source={{ uri: draft.uri }} style={{ width: '100%', height: 320 }} contentFit="cover" />
          ) : (
            <View className="h-[220px] items-center justify-center" style={{ backgroundColor: THEME.primary }}>
              <Glyph name={GLYPH.play} color={THEME.primaryForeground} size={36} />
              <AppText className="mt-2 text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                Short video ready
              </AppText>
            </View>
          )}
          <Pressable onPress={() => setDraft(null)} className="absolute right-3 top-3 rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(16,19,18,0.72)' }}>
            <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
              Change
            </AppText>
          </Pressable>
        </Card>
      ) : (
        <View className="flex-row gap-3">
          <PickTile
            label="Photo"
            hint="From your library"
            onPress={() => void pick(['images'])}
          />
          <PickTile
            label="Video"
            hint="Up to 30 seconds"
            onPress={() => void pick(['videos'])}
          />
        </View>
      )}

      {draft ? (
        <>
          <Input
            label="Caption"
            placeholder="Add a line if you want"
            value={caption}
            onChangeText={setCaption}
            maxLength={140}
            hint={caption.length > 0 ? `${caption.length}/140` : undefined}
          />

          {challengeOptions.length > 0 ? (
            <View className="gap-2">
              <AppText className="text-sm font-semibold text-charcoal">Link to a Challenge</AppText>
              <AppText className="text-[13px] text-muted">{copy('wave.chip')}</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {challengeOptions.map((challenge) => {
                  const active = challenge.id === challengeId;
                  return (
                    <Pressable
                      key={challenge.id}
                      onPress={() => setChallengeId(active ? null : challenge.id)}
                      className="rounded-full px-3 py-2"
                      style={{
                        flexShrink: 0,
                        backgroundColor: active ? THEME.accentSoft : THEME.surface,
                        borderWidth: 1,
                        borderColor: active ? THEME.accent : THEME.border,
                      }}>
                      <AppText
                        className="text-[13px] font-semibold"
                        numberOfLines={1}
                        style={{ color: active ? THEME.accent : THEME.textPrimary }}>
                        {challenge.title}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {selectedChallenge ? (
                <AppText className="text-[12px]" style={{ color: THEME.accent }}>
                  Linked to {selectedChallenge.title}
                </AppText>
              ) : null}
            </View>
          ) : null}

          {progress > 0 ? (
            <View className="gap-2">
              <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: THEME.border }}>
                <View
                  className="h-full rounded-full"
                  style={{ width: `${progress}%`, backgroundColor: THEME.accent }}
                />
              </View>
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color={THEME.accent} />
                <AppText className="text-[13px] text-muted">
                  {progress < 88 ? 'Uploading…' : copy('wave.posting')}
                </AppText>
              </View>
            </View>
          ) : null}

          {error ? (
            <AppText className="text-[13px]" style={{ color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}

          <Button title={copy('wave.share')} loading={posting} disabled={!draft} onPress={() => void publish()} />
        </>
      ) : (
        <AppText className="text-center text-[13px] text-muted">
          Pick something from your camera roll. That’s the whole move.
        </AppText>
      )}
    </ScrollView>
  );
}

function PickTile({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center justify-center px-3 py-8"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        ...themeShadow(),
      }}>
      <View
        className="mb-3 h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: THEME.accentSoft }}>
        <Glyph name={label === 'Video' ? GLYPH.play : GLYPH.camera} color={THEME.accent} size={20} />
      </View>
      <AppText className="text-[16px] font-bold text-charcoal">{label}</AppText>
      <AppText className="mt-1 text-center text-[12px] text-muted">{hint}</AppText>
    </Pressable>
  );
}
