import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';

import { InAppCamera } from '@/components/capture/InAppCamera';
import { rememberLastCapture } from '@/lib/lastCapture';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { captureKindFor, type CapturedMedia, type CaptureMode } from '@/components/capture/types';
import { AudienceIconButton, AudienceSheet } from '@/components/feed/AudienceSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCreatePost } from '@/hooks/useFeed';
import { useMyProfile } from '@/hooks/useProfile';
import {
  useCreateFeedEvent,
  useCreateReel,
  useCreateStory,
  useStoryChallengeOptions,
} from '@/hooks/useSocial';
import { cameraIsAvailable, ensureCapturePermissions, ensureLibraryPermission, openAppSettings, type MediaPermissionResult } from '@/lib/mediaPermissions';
import {
  asDefaultPostAudience,
  audienceLabel,
  feedVisibilityForAudience,
  type PostAudience,
} from '@/lib/postAudience';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import {
  ROUND_RECORD_MAX_SEC,
  WAVE_RECORD_MAX_SEC,
  formatWaveClipLabel,
  resolveMediaDurationMs,
  waveClipWindows,
} from '@/lib/waveClips';
import { waveHref, roundHref } from '@/lib/routes';
import { uploadPosterFromVideo } from '@/lib/videoPoster';
import { attachClipPostId } from '@/lib/social';
import { getErrorMessage, logPostgrestError } from '@/utils/errors';
import { asGalleryMedia } from '@/utils/media';
import { uploadPostMedia, uploadStoryMedia } from '@/utils/upload';

type CaptureStudioProps = {
  initialMode?: CaptureMode;
  initialMedia?: 'photo' | 'video';
  onClose?: () => void;
};

const REEL_MAX = ROUND_RECORD_MAX_SEC;
const POST_MAX = 60;

export function CaptureStudio({
  initialMode = 'story',
  initialMedia,
  onClose,
}: CaptureStudioProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const createStory = useCreateStory();
  const createReel = useCreateReel();
  const createPost = useCreatePost();
  const createFeedEvent = useCreateFeedEvent();
  const challenges = useStoryChallengeOptions();

  const mode = initialMode;
  const captureKind = captureKindFor(mode, initialMedia);
  const maxDuration = mode === 'reel' ? REEL_MAX : mode === 'post' ? POST_MAX : WAVE_RECORD_MAX_SEC;

  const [step, setStep] = useState<'camera' | 'preview'>('camera');
  const [draft, setDraft] = useState<CapturedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [clipCaptions, setClipCaptions] = useState<string[]>([]);
  const [audience, setAudience] = useState<PostAudience>(
    asDefaultPostAudience(profile?.default_post_audience),
  );
  const [audienceUserIds, setAudienceUserIds] = useState<string[]>([]);
  const [denied, setDenied] = useState<Extract<MediaPermissionResult, { ok: false }> | null>(null);
  const [webFallback, setWebFallback] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const posting = createStory.isPending || createReel.isPending || createPost.isPending || progress > 0;
  const challengeOptions = challenges.data ?? [];
  const selectedChallenge = useMemo(
    () => challengeOptions.find((row) => row.id === challengeId) ?? null,
    [challengeId, challengeOptions],
  );
  const waveClips = useMemo(
    () => (mode === 'story' && draft ? waveClipWindows(draft.durationMs, draft.mediaType) : []),
    [draft, mode],
  );
  const multiClip = mode === 'story' && draft?.mediaType === 'video' && waveClips.length > 1;

  function resetStudio() {
    setDraft(null);
    setCaption('');
    setClipCaptions([]);
    setStep('camera');
    setProgress(0);
    setError(null);
    rememberLastCapture(null);
  }

  function acceptDraft(next: CapturedMedia) {
    setDraft(next);
    setCaption('');
    setClipCaptions([]);
    setError(null);
    setStep('preview');
  }

  useEffect(() => {
    resetStudio();
  }, [mode]);

  useEffect(() => {
    return () => {
      stopAllLiveMedia();
    };
  }, []);

  useEffect(() => {
    if (mode === 'story') {
      return;
    }
    let cancelled = false;
    void (async () => {
      const permission = await ensureCapturePermissions(
        captureKind === 'photo' ? 'photo' : 'video',
      );
      if (cancelled) {
        return;
      }
      if (!permission.ok) {
        setDenied(permission);
        return;
      }
      const available = await cameraIsAvailable();
      if (cancelled) {
        return;
      }
      if (!available) {
        setWebFallback(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  function close() {
    stopAllLiveMedia();
    resetStudio();
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

  async function openLibrary() {
    setError(null);
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      setDenied(permission);
      return;
    }
    const videos = captureKind === 'video' || mode === 'story' || mode === 'post';
    const images = captureKind === 'photo' || mode === 'story' || mode === 'post';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: videos && images ? ['images', 'videos'] : videos ? ['videos'] : ['images'],
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
    const kind = asGalleryMedia({
      mimeType: asset.mimeType ?? asset.file?.type,
      fileName: asset.fileName,
      uri: asset.uri,
      type: asset.type,
    });
    if (!kind) {
      setError(copy('error.usePhotoOrVideo'));
      return;
    }
    const isVideo = kind === 'video';
    if (!isVideo) {
      rememberLastCapture({
        uri: asset.uri,
        mimeType: asset.mimeType ?? asset.file?.type,
        blob: asset.file ?? null,
        size: asset.fileSize ?? null,
      });
    }
    const durationMs = isVideo ? await resolveMediaDurationMs(asset.uri, asset.duration) : null;
    acceptDraft({
      uri: asset.uri,
      mediaType: isVideo ? 'video' : 'image',
      mimeType: asset.mimeType ?? asset.file?.type,
      blob: asset.file ?? null,
      durationMs,
    });
  }

  async function publish() {
    if (!draft || posting) {
      return;
    }
    if (!user?.id) {
      setError('You need to be signed in.');
      return;
    }
    if (audience === 'specific' && audienceUserIds.length === 0) {
      setError('Pick at least one person.');
      return;
    }
    setError(null);
    setProgress(12);
    const tick = setInterval(() => {
      setProgress((value) => (value > 0 && value < 82 ? Math.min(82, value + 6) : value));
    }, 180);
    let publishedWaveId: string | null = null;
    let publishedReelId: string | null = null;
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
            fileStem: `${mode === 'reel' ? 'reels' : 'posts'}/${Date.now()}`, // Round storage prefix stays `reels/`.
            mimeType: draft.mimeType,
            blob: draft.blob,
          }));
      setProgress(88);
      const posterUrl =
        draft.mediaType === 'video'
          ? await uploadPosterFromVideo({
              videoUri: draft.uri,
              userId: user.id,
              fileStem: `${mode === 'reel' ? 'reels' : 'stories'}/${Date.now()}-poster`,
            })
          : null;
      if (mode === 'reel') {
        const captionText = caption.trim();
        const reel = await createReel.mutateAsync({
          video_url: mediaUrl,
          thumbnail_url: posterUrl,
          caption: captionText || null,
          challenge_id: challengeId,
          duration_ms: draft.durationMs ?? null,
        });
        publishedReelId = reel.id;
        try {
          const posted = await createPost.mutateAsync({
            content: captionText,
            mediaUrls: [mediaUrl],
            audience,
            audienceUserIds: audience === 'specific' ? audienceUserIds : [],
            challengeId: challengeId ?? undefined,
            source: 'feed',
            type: 'round',
            durationMs: draft.durationMs ?? null,
          });
          await attachClipPostId('reel', reel.id, posted.id);
        } catch (postError) {
          logPostgrestError('round-feed-post', postError);
        }
        try {
          await createFeedEvent.mutateAsync({
            event_type: 'reel_posted',
            target_type: 'reel',
            target_id: reel.id,
            challenge_id: reel.challenge_id,
            visibility: feedVisibilityForAudience(audience),
            metadata: {
              caption: captionText || null,
              audience,
              audience_user_ids: audience === 'specific' ? audienceUserIds : [],
            },
          });
        } catch {
          // Round is live even if the activity card does not land.
        }
      } else if (mode === 'post') {
        await createPost.mutateAsync({
          content: caption.trim(),
          mediaUrls: [mediaUrl],
          audience,
          audienceUserIds: audience === 'specific' ? audienceUserIds : [],
          challengeId: challengeId ?? undefined,
        });
      } else {
        const clips = waveClips.map((clip, index) => ({
          ...clip,
          caption: multiClip ? clipCaptions[index]?.trim() || null : caption.trim() || null,
        }));
        const stories = await createStory.mutateAsync({
          media_url: mediaUrl,
          media_type: draft.mediaType,
          thumbnail_url: posterUrl,
          caption: multiClip ? null : caption.trim() || null,
          challenge_id: challengeId,
          clips,
        });
        for (const story of stories) {
          try {
            const posted = await createPost.mutateAsync({
              content: story.caption?.trim() || caption.trim(),
              mediaUrls: [mediaUrl],
              audience,
              audienceUserIds: audience === 'specific' ? audienceUserIds : [],
              challengeId: challengeId ?? undefined,
              source: 'feed',
              type: 'wave',
              durationMs: story.clip_duration_ms ?? draft.durationMs ?? null,
            });
            await attachClipPostId('story', story.id, posted.id);
          } catch (postError) {
            logPostgrestError('wave-feed-post', postError);
          }
        }
        publishedWaveId = stories[0]?.id ?? null;
        const first = stories[0];
        if (first) {
          try {
            await createFeedEvent.mutateAsync({
              event_type: 'story_posted',
              target_type: 'story',
              target_id: first.id,
              challenge_id: first.challenge_id,
              metadata: { media_type: first.media_type, clip_count: stories.length },
            });
          } catch {
            // Wave is live even if the feed card does not land.
          }
        }
      }
      setProgress(100);
      stopAllLiveMedia();
      resetStudio();
      if (publishedWaveId) {
        router.replace(waveHref(publishedWaveId, { from: 'home' }));
        return;
      }
      if (publishedReelId) {
        router.replace(roundHref(publishedReelId, { from: 'home', sharePrompt: true }));
        return;
      }
      close();
    } catch (caught) {
      setProgress(0);
      logPostgrestError('share-round', caught);
      const message = getErrorMessage(caught);
      setError(
        /undefined is not a function/i.test(message)
          ? 'Couldn’t share that Round. Try again.'
          : message,
      );
    } finally {
      clearInterval(tick);
    }
  }

  if (step === 'camera') {
    const libraryDenied = denied?.kind === 'library';
    return (
      <View className="flex-1">
        <InAppCamera
          capture={captureKind}
          facingKind={mode === 'post' ? 'proof' : 'social'}
          maxDuration={maxDuration}
          shutterHint={mode === 'story' ? copy('wave.shutter') : mode === 'reel' ? copy('round.shutter') : undefined}
          blocked={mode === 'story' ? false : Boolean(denied && denied.kind !== 'library')}
          blockedReason={
            denied?.kind === 'microphone'
              ? 'Microphone is off.'
              : denied && denied.kind !== 'library'
                ? 'Camera is off.'
                : undefined
          }
          webFallback={mode === 'story' ? false : webFallback}
          chromeInset={false}
          allowModeToggle={mode === 'story' || mode === 'post'}
          deniedTitle={mode === 'story' ? copy('wave.cameraNeed') : undefined}
          onCaptured={(next) => {
            if (next.mediaType === 'image') {
              rememberLastCapture({
                uri: next.uri,
                mimeType: next.mimeType,
                blob: next.blob,
              });
            }
            acceptDraft(next);
          }}
          onOpenGallery={() => void openLibrary()}
          onCancel={close}
          onUnavailable={mode === 'story' ? undefined : () => setWebFallback(true)}
        />
        {libraryDenied ? (
          <View
            className="absolute bottom-24 left-4 right-4 flex-row items-center justify-between rounded-2xl px-3 py-2"
            style={{ backgroundColor: 'rgba(16,19,18,0.88)' }}>
            <AppText className="mr-3 flex-1 text-[12px] font-semibold" style={{ color: '#fff' }}>
              {Platform.OS === 'web' ? 'Couldn’t open photos. Pick a file instead.' : 'Photo library is off.'}
            </AppText>
            {Platform.OS === 'web' ? (
              <Pressable onPress={() => void openLibrary()}>
                <AppText className="text-[12px] font-bold" style={{ color: THEME.accentBright }}>
                  Gallery
                </AppText>
              </Pressable>
            ) : (
              <Pressable onPress={() => void openAppSettings()}>
                <AppText className="text-[12px] font-bold" style={{ color: THEME.accentBright }}>
                  Open Settings
                </AppText>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1">
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-6 pt-3"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View className="flex-row items-start justify-between">
        <AppText className="text-[22px] font-bold text-charcoal">
          {mode === 'reel' ? copy('round.new') : mode === 'post' ? 'New post' : copy('wave.new')}
        </AppText>
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
            <Image source={{ uri: draft.uri }} style={{ width: '100%', height: 280 }} contentFit="cover" />
          ) : (
            <DraftClipPreview uri={draft.uri} />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              rememberLastCapture(null);
              setDraft(null);
              setCaption('');
              setClipCaptions([]);
              setStep('camera');
            }}
            className="absolute right-3 top-3 rounded-full px-3 py-1.5"
            style={{ backgroundColor: 'rgba(16,19,18,0.72)' }}>
            <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
              Retake
            </AppText>
          </Pressable>
        </Card>
      ) : null}

      {multiClip ? (
        <View className="gap-3">
          {waveClips.map((clip, index) => (
            <Input
              key={`${clip.startMs}-${clip.durationMs}`}
              label={formatWaveClipLabel(index, clip)}
              placeholder="Add a caption"
              value={clipCaptions[index] ?? ''}
              onChangeText={(value) =>
                setClipCaptions((current) => {
                  const next = waveClips.map((_, slot) => current[slot] ?? '');
                  next[index] = value;
                  return next;
                })
              }
              grow
              maxLength={140}
              hint={
                (clipCaptions[index] ?? '').length > 0
                  ? `${(clipCaptions[index] ?? '').length}/140`
                  : undefined
              }
            />
          ))}
        </View>
      ) : (
        <Input
          label="Caption"
          placeholder="Add a caption"
          value={caption}
          onChangeText={setCaption}
          grow
          maxLength={mode === 'post' ? 280 : 140}
          hint={caption.length > 0 ? `${caption.length}/${mode === 'post' ? 280 : 140}` : undefined}
        />
      )}

      {challengeOptions.length > 0 ? (
        <View className="gap-2">
          <AppText className="text-sm font-semibold text-charcoal">Challenge tag</AppText>
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
              {selectedChallenge.title}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View className="gap-1">
        <AppText className="text-sm font-semibold text-charcoal">Who can see this</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Audience, ${audienceLabel(audience)}`}
          onPress={() => setAudienceOpen(true)}
          className="flex-row items-center justify-between px-3"
          style={{
            minHeight: 48,
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.surface,
          }}>
          <AppText className="text-[15px] font-semibold text-charcoal">
            {audienceLabel(audience)}
            {audience === 'specific' && audienceUserIds.length > 0
              ? ` · ${audienceUserIds.length}`
              : ''}
          </AppText>
          <AudienceIconButton audience={audience} />
        </Pressable>
      </View>

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
        title={mode === 'reel' ? copy('round.share') : mode === 'post' ? 'Post' : copy('wave.share')}
        loading={posting}
        onPress={() => void publish()}
      />
    </ScrollView>
    {audienceOpen ? (
      <AudienceSheet
        draft={{
          audience,
          audienceUserIds,
          onSave: (next, ids) => {
            setAudience(next);
            setAudienceUserIds(ids);
          },
        }}
        onClose={() => setAudienceOpen(false)}
      />
    ) : null}
    </View>
  );
}

function DraftClipPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.currentTime = 0;
  });

  useEffect(() => {
    let cancelled = false;
    player.muted = true;
    player.currentTime = 0.05;
    try {
      player.play();
    } catch {
      // First-frame decode can fail on a still-creating blob URL.
    }
    const id = setTimeout(() => {
      if (cancelled) {
        return;
      }
      player.pause();
      player.currentTime = 0.05;
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [player, uri]);

  return (
    <View style={{ width: '100%', height: 280, backgroundColor: THEME.primary }}>
      <VideoView
        player={player}
        style={{ width: '100%', height: 280 }}
        contentFit="cover"
        nativeControls={false}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(16,19,18,0.55)',
          }}>
          <Glyph name={GLYPH.play} color="#fff" size={18} />
        </View>
      </View>
    </View>
  );
}
