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
import { useCreateFeedEvent, useCreateStory, useStoryChallengeOptions } from '@/hooks/useSocial';
import { THEME, themeShadow } from '@/lib/theme';
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
        'Turn on library access in Settings so you can pick a photo or short video for your story.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.8,
      allowsEditing: false,
      videoMaxDuration: 15,
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
      Alert.alert('Sign in first', 'You need to be signed in to post a story.');
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
      const story = await createStory.mutateAsync({
        media_url: mediaUrl,
        media_type: draft.mediaType,
        caption: caption.trim() || null,
        challenge_id: challengeId,
      });
      setProgress(100);
      try {
        await createFeedEvent.mutateAsync({
          event_type: 'story_posted',
          target_type: 'story',
          target_id: story.id,
          challenge_id: story.challenge_id,
          metadata: { media_type: story.media_type },
        });
      } catch {
        // The story is live even if the feed card does not land.
      }
      onPosted?.(story.id);
      close();
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
          <AppText className="text-[22px] font-bold text-charcoal">New story</AppText>
          <AppText className="mt-1 text-[14px] text-muted">
            A photo or 15-second clip. It disappears in 24 hours.
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
            hint="Up to 15 seconds"
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
              <AppText className="text-[13px] text-muted">Optional. Shows a chip on your story.</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {challengeOptions.map((challenge) => {
                  const active = challenge.id === challengeId;
                  return (
                    <Pressable
                      key={challenge.id}
                      onPress={() => setChallengeId(active ? null : challenge.id)}
                      className="rounded-full px-3 py-2"
                      style={{
                        backgroundColor: active ? THEME.accentSoft : THEME.surface,
                        borderWidth: 1,
                        borderColor: active ? THEME.accent : THEME.border,
                      }}>
                      <AppText
                        className="text-[13px] font-semibold"
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
                  {progress < 88 ? 'Uploading…' : 'Posting your story…'}
                </AppText>
              </View>
            </View>
          ) : null}

          {error ? (
            <AppText className="text-[13px]" style={{ color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}

          <Button title="Share story" loading={posting} disabled={!draft} onPress={() => void publish()} />
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
