import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';

import { InAppCamera } from '@/components/capture/InAppCamera';
import { SaveCaptureHint } from '@/components/capture/SaveCaptureHint';
import { takeClipAttach } from '@/lib/clipAttach';
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
import { useCreatePost, seedPublishedPost } from '@/hooks/useFeed';
import { useMyProfile } from '@/hooks/useProfile';
import {
  seedPublishedReel,
  seedPublishedWave,
  useCreateFeedEvent,
  useCreateReel,
  useCreateStory,
  useStoryChallengeOptions,
  type ReelItem,
} from '@/hooks/useSocial';
import { cameraIsAvailable, ensureCapturePermissions, ensureLibraryPermission, openAppSettings, type MediaPermissionResult } from '@/lib/mediaPermissions';
import {
  asDefaultPostAudience,
  audienceLabel,
  DEFAULT_POST_AUDIENCE,
  feedVisibilityForAudience,
  type PostAudience,
} from '@/lib/postAudience';
import type { ComposeInput, Post, PostWithMeta } from '@/lib/types';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import {
  ROUND_RECORD_MAX_SEC,
  WAVE_CLIP_MS,
  WAVE_RECORD_MAX_SEC,
  formatWaveClock,
  resolveMediaDurationMs,
} from '@/lib/waveClips';
import { WAVE_CLIP_MIN_MS, keepPlayableWaveClips, storyClipsForPublish } from '@/lib/waveSession';
import { publishedRowId, waveHref, roundHref } from '@/lib/routes';
import { uploadPosterFromVideo } from '@/lib/videoPoster';
import { fetchActiveChallenges } from '@/lib/challenges';
import { pickHostedRoundChallengeId } from '@/lib/homeRounds';
import { attachClipPostId } from '@/lib/social';
import { sessionAuthor } from '@/lib/safeIds';
import { logWaveFail, WAVE_TAG_SOFT_FAIL, waveSessionAuthor } from '@/lib/wavePublish';
import { uploadProgressPercent } from '@/lib/uploadProgress';
import { getErrorMessage, logPostgrestError } from '@/utils/errors';
import { asGalleryMedia, localUriFromPickerAsset } from '@/utils/media';
import { uploadPostMedia, uploadStoryMedia } from '@/utils/upload';

type CaptureStudioProps = {
  initialMode?: CaptureMode;
  initialMedia?: 'photo' | 'video';
  initialChallengeId?: string | null;
  onClose?: () => void;
};

const REEL_MAX = ROUND_RECORD_MAX_SEC;
const POST_MAX = 60;

export function CaptureStudio({
  initialMode = 'story',
  initialMedia,
  initialChallengeId = null,
  onClose,
}: CaptureStudioProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const [challengeId, setChallengeId] = useState<string | null>(() =>
    String(initialChallengeId ?? '').trim() || null,
  );
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
  const [drafts, setDrafts] = useState<CapturedMedia[]>([]);
  const draft = drafts[0] ?? null;
  const [fromCamera, setFromCamera] = useState(false);
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

  useEffect(() => {
    if (mode !== 'reel' || challengeId || !user?.id) {
      return;
    }
    let live = true;
    void fetchActiveChallenges(user.id)
      .then((rows) => {
        if (!live) {
          return;
        }
        const hosted = pickHostedRoundChallengeId(rows, user.id);
        if (hosted) {
          setChallengeId(hosted);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mode, challengeId, user?.id]);
  const reviewClips = useMemo(() => {
    if (mode !== 'story') {
      return drafts;
    }
    return keepPlayableWaveClips(
      drafts.map((clip) => ({
        ...clip,
        size: clip.blob?.size ?? (clip.uri ? 1 : 0),
      })),
    );
  }, [drafts, mode]);
  const multiClip = mode === 'story' && reviewClips.length > 1;

  function resetStudio() {
    setDrafts([]);
    setCaption('');
    setClipCaptions([]);
    setStep('camera');
    setProgress(0);
    setError(null);
    rememberLastCapture(null);
    setFromCamera(false);
  }

  function acceptDrafts(next: CapturedMedia | CapturedMedia[]) {
    const list = keepPlayableWaveClips(
      (Array.isArray(next) ? next : [next]).map((clip) => ({
        ...clip,
        size: clip.blob?.size ?? (clip.uri ? 1 : 0),
      })),
    );
    if (list.length === 0) {
      return;
    }
    setDrafts(list);
    setCaption('');
    setClipCaptions(list.map(() => ''));
    setError(null);
    setStep('preview');
  }

  useEffect(() => {
    resetStudio();
    const attached = takeClipAttach();
    if (!attached?.uri) {
      return;
    }
    acceptDrafts({
      uri: attached.uri,
      mediaType: attached.mediaType,
      mimeType: attached.mimeType,
      durationMs: attached.durationMs,
    });
    setFromCamera(false);
    setCaption(attached.caption ?? '');
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
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    const uri = localUriFromPickerAsset(asset);
    if (!uri) {
      setError(copy('error.usePhotoOrVideo'));
      return;
    }
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
        uri,
        mimeType: asset.mimeType ?? asset.file?.type,
        blob: asset.file ?? null,
        size: asset.fileSize ?? null,
      });
    }
    const durationMs = isVideo ? await resolveMediaDurationMs(uri, asset.duration) : null;
    setFromCamera(false);
    acceptDrafts({
      uri,
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
    stopAllLiveMedia();
    const author =
      waveSessionAuthor(profile, user.id) ??
      sessionAuthor(profile, user.id) ?? {
        id: user.id,
        username: 'blob',
        display_name: null,
        avatar_url: null,
      };
    setError(null);
    setProgress(1);
    const tick = setInterval(() => {
      setProgress((value) => (value > 0 && value < 82 ? Math.min(82, value + 6) : value));
    }, 180);
    let publishedWaveId: string | null = null;
    let publishedReelId: string | null = null;
    try {
      const onUploadProgress = (event: { loaded: number; total: number }) => {
        const percent = uploadProgressPercent(event.loaded, event.total);
        if (percent == null) {
          return;
        }
        setProgress(Math.max(8, Math.min(82, percent)));
      };
      const waveUploads =
        mode === 'story'
          ? await (async () => {
              const items = reviewClips;
              if (items.length === 0) {
                throw new Error('That clip had no video.');
              }
              const uploaded: {
                mediaUrl: string;
                posterUrl: string | null;
                item: CapturedMedia;
                caption: string;
              }[] = [];
              for (let index = 0; index < items.length; index += 1) {
                const item = items[index]!;
                const mediaUrl = await uploadStoryMedia({
                  uri: item.uri,
                  userId: user.id,
                  mimeType: item.mimeType,
                  blob: item.blob,
                  onProgress: onUploadProgress,
                });
                const posterUrl =
                  item.mediaType === 'video'
                    ? await uploadPosterFromVideo({
                        videoUri: item.uri,
                        userId: user.id,
                        fileStem: `stories/${Date.now()}-${index}-poster`,
                      })
                    : null;
                uploaded.push({
                  mediaUrl,
                  posterUrl,
                  item,
                  caption: multiClip ? clipCaptions[index]?.trim() || '' : caption.trim(),
                });
              }
              return uploaded;
            })()
          : null;
      const mediaUrl = waveUploads
        ? waveUploads[0]!.mediaUrl
        : await uploadPostMedia({
            uri: draft.uri,
            userId: user.id,
            fileStem: `${mode === 'reel' ? 'reels' : 'posts'}/${Date.now()}`, // Round storage prefix stays `reels/`.
            mimeType: draft.mimeType,
            blob: draft.blob,
            onProgress: onUploadProgress,
          });
      setProgress(88);
      const posterUrl = waveUploads
        ? waveUploads[0]!.posterUrl
        : draft.mediaType === 'video'
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
        publishedReelId = publishedRowId(reel);
        if (!publishedReelId) {
          setError('Couldn’t open that clip');
          return;
        }
        const posted = await ensureClipFeedPost({
          createPost: (input) => createPost.mutateAsync(input),
          content: captionText,
          mediaUrls: [mediaUrl],
          audience,
          audienceUserIds,
          challengeId,
          type: 'round',
          durationMs: draft.durationMs ?? null,
        });
        const postedId = publishedRowId(posted);
        if (postedId) {
          await attachClipPostId('reel', publishedReelId, postedId);
          seedPublishedPost(queryClient, user.id, {
            ...(posted as Post),
            id: postedId,
            author_id: user.id,
            author,
            comments: [],
            reactions: [],
          } as PostWithMeta);
        }
        seedPublishedReel(
          queryClient,
          {
            ...reel,
            id: publishedReelId,
            user_id: reel.user_id || user.id,
            profile: author as ReelItem['profile'],
          },
          author,
        );
        try {
          await createFeedEvent.mutateAsync({
            event_type: 'reel_posted',
            target_type: 'reel',
            target_id: publishedReelId,
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
        const uploads = waveUploads ?? [];
        const clips = storyClipsForPublish({
          mediaType: draft.mediaType,
          clips: uploads.map((row) => ({
            startMs: 0,
            durationMs:
              draft.mediaType === 'image'
                ? WAVE_CLIP_MS
                : row.item.durationMs != null && row.item.durationMs > 0
                  ? Math.min(row.item.durationMs, WAVE_CLIP_MS)
                  : WAVE_CLIP_MS,
            caption: row.caption.trim() || null,
            mediaUrl: row.mediaUrl,
            thumbnailUrl: row.posterUrl,
            size: row.item.blob?.size ?? (row.item.uri ? 1 : 0),
          })),
        });
        if (clips.length === 0) {
          throw new Error('That clip had no video.');
        }
        let created;
        try {
          created = await createStory.mutateAsync({
            media_url: clips[0]!.mediaUrl || mediaUrl,
            media_type: draft.mediaType,
            thumbnail_url: clips[0]!.thumbnailUrl ?? posterUrl,
            caption: multiClip ? null : caption.trim() || null,
            challenge_id: challengeId,
            clips,
          });
        } catch (tagError) {
          if (!challengeId) {
            logWaveFail('insert', tagError);
            throw tagError;
          }
          logWaveFail('tag', tagError);
          try {
            created = await createStory.mutateAsync({
              media_url: clips[0]!.mediaUrl || mediaUrl,
              media_type: draft.mediaType,
              thumbnail_url: clips[0]!.thumbnailUrl ?? posterUrl,
              caption: multiClip ? null : caption.trim() || null,
              challenge_id: null,
              clips,
            });
            setError(WAVE_TAG_SOFT_FAIL);
          } catch (insertError) {
            logWaveFail('insert', insertError);
            throw insertError;
          }
        }
        const stories = Array.isArray(created) ? created : created ? [created] : [];
        publishedWaveId = publishedRowId(stories);
        if (!publishedWaveId) {
          setError('Couldn’t open that clip');
          return;
        }
        for (const story of stories) {
          const storyId = publishedRowId(story);
          if (!storyId) {
            continue;
          }
          const storyMedia = story.media_url || clips[story.sequence_index ?? 0]?.mediaUrl || mediaUrl;
          if (!storyMedia) {
            continue;
          }
          if (
            story.media_type === 'video' &&
            story.clip_duration_ms != null &&
            story.clip_duration_ms < WAVE_CLIP_MIN_MS
          ) {
            continue;
          }
          let posted: Post | null = null;
          try {
            posted = await ensureClipFeedPost({
              createPost: (input) => createPost.mutateAsync(input),
              content: story.caption?.trim() || caption.trim(),
              mediaUrls: [storyMedia],
              audience,
              audienceUserIds,
              challengeId: story.challenge_id ?? challengeId,
              type: 'wave',
              durationMs: story.clip_duration_ms ?? draft.durationMs ?? null,
            });
          } catch (postError) {
            logWaveFail('tag', postError);
            setError(WAVE_TAG_SOFT_FAIL);
          }
          const postedId = publishedRowId(posted);
          if (postedId) {
            await attachClipPostId('story', storyId, postedId);
            seedPublishedPost(queryClient, user.id, {
              ...(posted as Post),
              id: postedId,
              author_id: author.id,
              author,
              comments: [],
              reactions: [],
            } as PostWithMeta);
          }
          seedPublishedWave(queryClient, { ...story, id: storyId, user_id: story.user_id || author.id }, author);
        }
        const first = stories.find((row) => publishedRowId(row) === publishedWaveId) ?? stories[0];
        if (first && publishedWaveId) {
          try {
            await createFeedEvent.mutateAsync({
              event_type: 'story_posted',
              target_type: 'story',
              target_id: publishedWaveId,
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
        try {
          router.replace(waveHref(publishedWaveId, { from: 'home' }));
        } catch (navError) {
          logWaveFail('navigate', navError);
          router.replace('/feed');
        }
        return;
      }
      if (publishedReelId) {
        router.replace(roundHref(publishedReelId, { from: 'home', sharePrompt: true }));
        return;
      }
      close();
    } catch (caught) {
      stopAllLiveMedia();
      setProgress(0);
      logWaveFail(mode === 'story' ? 'insert' : 'insert', caught);
      logPostgrestError(mode === 'story' ? 'share-wave' : 'share-round', caught);
      const message = getErrorMessage(caught);
      setError(
        /undefined is not a function/i.test(message)
          ? mode === 'story'
            ? 'Couldn’t share that Wave. Try again.'
            : 'Couldn’t share that Round. Try again.'
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
          shutterHint={
            mode === 'story' ? copy('wave.shutter') : mode === 'reel' ? copy('round.shutter') : undefined
          }
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
          waveSession={mode === 'story'}
          onCaptured={(next) => {
            if (next.mediaType === 'image') {
              rememberLastCapture({
                uri: next.uri,
                mimeType: next.mimeType,
                blob: next.blob,
              });
            }
            setFromCamera(true);
            acceptDrafts(next);
          }}
          onWaveSession={(clips) => {
            setFromCamera(true);
            acceptDrafts(clips);
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

      {reviewClips.map((clip, index) => (
        <View key={`${clip.uri}-${index}`} className="gap-3">
          <Card padded={false} className="overflow-hidden">
            {clip.mediaType === 'image' ? (
              <Image source={{ uri: clip.uri }} style={{ width: '100%', height: 280 }} contentFit="cover" />
            ) : (
              <DraftClipPreview uri={clip.uri} />
            )}
            {index === 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  rememberLastCapture(null);
                  setDrafts([]);
                  setFromCamera(false);
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
            ) : null}
            {progress > 0 && index === 0 ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  paddingTop: 28,
                  backgroundColor: 'rgba(16,19,18,0.45)',
                }}>
                <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: THEME.border }}>
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(6, progress)}%`, backgroundColor: THEME.accentBright }}
                  />
                </View>
                <AppText className="mt-1.5 text-[12px] font-semibold" style={{ color: '#fff' }}>
                  {progress < 88 ? `${Math.round(progress)}%` : 'Sharing…'}
                </AppText>
              </View>
            ) : null}
          </Card>
          {fromCamera && index === 0 ? (
            <SaveCaptureHint
              uri={clip.uri}
              blob={clip.blob}
              mimeType={clip.mimeType}
              mediaType={clip.mediaType}
            />
          ) : null}
          {multiClip ? (
            <Input
              label={`Clip ${index + 1} · ${formatWaveClock(clip.durationMs ?? 0)}`}
              placeholder="Add a caption"
              value={clipCaptions[index] ?? ''}
              onChangeText={(value) =>
                setClipCaptions((current) => {
                  const next = reviewClips.map((_, slot) => current[slot] ?? '');
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
          ) : null}
        </View>
      ))}

      {multiClip ? null : (
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
        {mode === 'story' || mode === 'reel' ? (
          <AppText className="text-[12px] text-muted">
            {audience === 'public'
              ? copy(mode === 'reel' ? 'round.audiencePublic' : 'wave.audiencePublic')
              : audience === 'friends'
                ? copy(mode === 'reel' ? 'round.audienceFriends' : 'wave.audienceFriends')
                : audience === 'specific'
                  ? 'Only the people you pick can see this.'
                  : copy(mode === 'reel' ? 'round.audienceFriends' : 'wave.audienceFriends')}
          </AppText>
        ) : null}
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

async function ensureClipFeedPost(input: {
  createPost: (payload: ComposeInput) => Promise<Post>;
  content: string;
  mediaUrls: string[];
  audience: PostAudience;
  audienceUserIds: string[];
  challengeId: string | null;
  type: 'wave' | 'round';
  durationMs: number | null;
}): Promise<Post> {
  const audience = input.audience || DEFAULT_POST_AUDIENCE;
  const payload: ComposeInput = {
    content: input.content,
    mediaUrls: input.mediaUrls,
    audience,
    audienceUserIds: audience === 'specific' ? input.audienceUserIds : [],
    challengeId: input.challengeId ?? undefined,
    source: 'feed',
    type: input.type,
    durationMs: input.durationMs,
  };
  try {
    return await input.createPost(payload);
  } catch (first) {
    logPostgrestError('clip-feed-post', first);
    try {
      return await input.createPost({
        ...payload,
        audience: DEFAULT_POST_AUDIENCE,
        audienceUserIds: [],
        challengeId: undefined,
      });
    } catch (second) {
      logWaveFail('tag', second);
      throw second;
    }
  }
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
