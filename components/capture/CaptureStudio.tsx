import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { InAppCamera } from '@/components/capture/InAppCamera';
import { PermissionRecovery } from '@/components/capture/PermissionRecovery';
import type { CapturedMedia, CaptureMode } from '@/components/capture/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCreatePost } from '@/hooks/useFeed';
import {
  useCreateFeedEvent,
  useCreateReel,
  useCreateStory,
  useStoryChallengeOptions,
} from '@/hooks/useSocial';
import {
  cameraIsAvailable,
  ensureCapturePermissions,
  ensureLibraryPermission,
  type MediaPermissionKind,
  type MediaPermissionResult,
} from '@/lib/mediaPermissions';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { uploadPostMedia, uploadStoryMedia } from '@/utils/upload';

type CaptureStudioProps = {
  initialMode?: CaptureMode | 'choose';
  onClose?: () => void;
};

const STORY_MAX = 15;
const REEL_MAX = 45;
const POST_MAX = 60;

export function CaptureStudio({ initialMode = 'choose', onClose }: CaptureStudioProps) {
  const router = useRouter();
  const { user } = useAuth();
  const createStory = useCreateStory();
  const createReel = useCreateReel();
  const createPost = useCreatePost();
  const createFeedEvent = useCreateFeedEvent();
  const challenges = useStoryChallengeOptions();

  const [mode, setMode] = useState<CaptureMode | 'choose'>(initialMode);
  const [step, setStep] = useState<'source' | 'camera' | 'preview'>('source');
  const [mediaKind, setMediaKind] = useState<'photo' | 'video'>(initialMode === 'reel' ? 'video' : 'photo');
  const [draft, setDraft] = useState<CapturedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [denied, setDenied] = useState<Extract<MediaPermissionResult, { ok: false }> | null>(null);
  const [webFallback, setWebFallback] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const posting = createStory.isPending || createReel.isPending || createPost.isPending || progress > 0;
  const maxDuration = mode === 'reel' ? REEL_MAX : mode === 'post' ? POST_MAX : STORY_MAX;
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
      return;
    }
    router.replace('/feed');
  }

  function titleForMode() {
    if (mode === 'reel') {
      return 'New Reel';
    }
    if (mode === 'post') {
      return 'New photo';
    }
    return 'New story';
  }

  async function openCamera(kind: 'photo' | 'video') {
    setError(null);
    setDenied(null);
    setMediaKind(kind);
    const permission = await ensureCapturePermissions(kind);
    if (!permission.ok) {
      setDenied(permission);
      return;
    }
    const available = await cameraIsAvailable();
    if (!available || (Platform.OS === 'web' && kind === 'video')) {
      setWebFallback(true);
      await openLibrary(kind);
      return;
    }
    setStep('camera');
  }

  async function openLibrary(kind: 'photo' | 'video') {
    setError(null);
    setDenied(null);
    setMediaKind(kind);
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      setDenied(permission);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      quality: 0.8,
      allowsEditing: false,
      videoMaxDuration: maxDuration,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }
    const asset = result.assets[0];
    setDraft({
      uri: asset.uri,
      mediaType: kind === 'video' ? 'video' : 'image',
      mimeType: asset.mimeType ?? asset.file?.type,
      blob: asset.file ?? null,
      durationMs: asset.duration != null ? Math.round(asset.duration) : null,
    });
    setStep('preview');
  }

  async function publish() {
    if (!draft || posting) {
      return;
    }
    if (!user?.id) {
      setError('You need to be signed in.');
      return;
    }
    setError(null);
    setProgress(12);
    const tick = setInterval(() => {
      setProgress((value) => (value > 0 && value < 82 ? Math.min(82, value + 6) : value));
    }, 180);
    try {
      const mediaUrl = await (mode === 'story'
        ? uploadStoryMedia({
            uri: draft.uri,
            userId: user.id,
            mimeType: draft.mimeType,
            blob: draft.blob,
          })
        : uploadPostMedia({
            uri: draft.uri,
            userId: user.id,
            fileStem: `${mode === 'reel' ? 'reels' : 'posts'}/${Date.now()}`,
            mimeType: draft.mimeType,
            blob: draft.blob,
          }));
      setProgress(88);
      if (mode === 'reel') {
        const reel = await createReel.mutateAsync({
          video_url: mediaUrl,
          caption: caption.trim() || null,
          challenge_id: challengeId,
          duration_ms: draft.durationMs ?? null,
        });
        try {
          await createFeedEvent.mutateAsync({
            event_type: 'reel_posted',
            target_type: 'reel',
            target_id: reel.id,
            challenge_id: reel.challenge_id,
          });
        } catch {
          // Reel is live even if the feed card does not land.
        }
      } else if (mode === 'post') {
        await createPost.mutateAsync({
          content: caption.trim(),
          mediaUrls: [mediaUrl],
        });
      } else {
        const story = await createStory.mutateAsync({
          media_url: mediaUrl,
          media_type: draft.mediaType,
          caption: caption.trim() || null,
          challenge_id: challengeId,
        });
        try {
          await createFeedEvent.mutateAsync({
            event_type: 'story_posted',
            target_type: 'story',
            target_id: story.id,
            challenge_id: story.challenge_id,
            metadata: { media_type: story.media_type },
          });
        } catch {
          // Story is live even if the feed card does not land.
        }
      }
      setProgress(100);
      close();
    } catch (caught) {
      setProgress(0);
      setError(getErrorMessage(caught));
    } finally {
      clearInterval(tick);
    }
  }

  if (mode === 'choose') {
    return (
      <View className="flex-1 gap-4 pt-1">
        <Header
          title="Add to Story / Reel"
          subtitle="A 24-hour Story or a short Reel. Friendly, not a broadcast."
          onClose={close}
        />
        <View className="flex-row gap-3">
          <ChoiceTile label="Story" hint="Photo or 15s clip" onPress={() => setMode('story')} />
          <ChoiceTile label="Reel" hint="Video up to 45s" onPress={() => { setMode('reel'); setMediaKind('video'); }} />
        </View>
      </View>
    );
  }

  if (step === 'camera') {
    return (
      <View className="flex-1 gap-3 pt-1">
        <Header
          title={titleForMode()}
          subtitle={
            mode === 'reel'
              ? 'Record up to 45 seconds.'
              : 'Take the shot. It stays in this space.'
          }
          onClose={close}
        />
        <InAppCamera
          media={mediaKind}
          maxDuration={maxDuration}
          onCaptured={(next) => {
            setDraft(next);
            setStep('preview');
          }}
          onCancel={() => setStep('source')}
          onUnavailable={() => {
            setWebFallback(true);
            setStep('source');
            void openLibrary(mediaKind);
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 pb-6 pt-1"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <Header
        title={titleForMode()}
        subtitle={
          mode === 'reel'
            ? 'A short clip. Optional caption, optional Challenge tag.'
            : mode === 'post'
              ? 'A photo or clip for the feed.'
              : 'A photo or 15-second clip. It disappears in 24 hours.'
        }
        onClose={close}
      />
      {webFallback ? (
        <AppText className="text-[13px] leading-5 text-muted">
          This browser can’t open the in-app camera. Pick a file from your library instead.
        </AppText>
      ) : null}

      {denied ? (
        <PermissionRecovery
          kind={denied.kind as MediaPermissionKind}
          canAskAgain={denied.canAskAgain}
          onRetry={() => {
            setDenied(null);
            if (denied.kind === 'library') {
              void openLibrary(mediaKind);
              return;
            }
            void openCamera(mediaKind);
          }}
        />
      ) : null}

      {draft && step === 'preview' ? (
        <Card padded={false} className="overflow-hidden">
          {draft.mediaType === 'image' ? (
            <Image source={{ uri: draft.uri }} style={{ width: '100%', height: 280 }} contentFit="cover" />
          ) : (
            <View className="h-[200px] items-center justify-center" style={{ backgroundColor: THEME.primary }}>
              <AppText className="text-[14px] font-semibold" style={{ color: THEME.primaryForeground }}>
                Clip ready
              </AppText>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDraft(null);
              setStep('source');
            }}
            className="absolute right-3 top-3 rounded-full px-3 py-1.5"
            style={{ backgroundColor: 'rgba(16,19,18,0.72)' }}>
            <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
              Change
            </AppText>
          </Pressable>
        </Card>
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <ChoiceTile
              label="Camera"
              hint={mediaKind === 'video' ? `Record up to ${maxDuration}s` : 'Take a photo'}
              onPress={() => void openCamera(mode === 'reel' ? 'video' : mediaKind)}
            />
            <ChoiceTile
              label="Library"
              hint="From your camera roll"
              onPress={() => void openLibrary(mode === 'reel' ? 'video' : mediaKind)}
            />
          </View>
          {mode !== 'reel' ? (
            <View className="flex-row gap-2">
              <Chip active={mediaKind === 'photo'} label="Photo" onPress={() => setMediaKind('photo')} />
              <Chip active={mediaKind === 'video'} label="Video" onPress={() => setMediaKind('video')} />
            </View>
          ) : null}
        </View>
      )}

      {draft && step === 'preview' ? (
        <>
          <Input
            label="Caption"
            placeholder="Add a line if you want"
            value={caption}
            onChangeText={setCaption}
            maxLength={mode === 'post' ? 280 : 140}
            hint={caption.length > 0 ? `${caption.length}/${mode === 'post' ? 280 : 140}` : undefined}
          />
          {mode !== 'post' && challengeOptions.length > 0 ? (
            <View className="gap-2">
              <AppText className="text-sm font-semibold text-charcoal">Link to a Challenge</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {challengeOptions.map((challenge) => {
                  const active = challenge.id === challengeId;
                  return (
                    <Pressable
                      key={challenge.id}
                      accessibilityRole="button"
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
                <View className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: THEME.accent }} />
              </View>
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color={THEME.accent} />
                <AppText className="text-[13px] text-muted">
                  {progress < 88 ? 'Uploading…' : 'Sharing…'}
                </AppText>
              </View>
            </View>
          ) : null}
          {error ? (
            <AppText className="text-[13px]" style={{ color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}
          <Button
            title={mode === 'reel' ? 'Share Reel' : mode === 'post' ? 'Post' : 'Share story'}
            loading={posting}
            onPress={() => void publish()}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function Header({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <View className="flex-row items-start justify-between">
      <View className="flex-1 pr-3">
        <AppText className="text-[22px] font-bold text-charcoal">{title}</AppText>
        <AppText className="mt-1 text-[14px] text-muted">{subtitle}</AppText>
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border }}>
        <AppText className="text-[18px] font-semibold text-muted">×</AppText>
      </Pressable>
    </View>
  );
}

function ChoiceTile({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
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
      <AppText className="text-[16px] font-bold text-charcoal">{label}</AppText>
      <AppText className="mt-1 text-center text-[12px] text-muted">{hint}</AppText>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-full px-3 py-2"
      style={{
        backgroundColor: active ? THEME.accentSoft : THEME.surface,
        borderWidth: 1,
        borderColor: active ? THEME.accent : THEME.border,
      }}>
      <AppText className="text-[13px] font-semibold" style={{ color: active ? THEME.accent : THEME.textPrimary }}>
        {label}
      </AppText>
    </Pressable>
  );
}
