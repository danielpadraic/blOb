import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { InAppCamera } from '@/components/capture/InAppCamera';
import { captureKindForProof } from '@/components/capture/types';
import { HealthWorkoutSheet } from '@/components/challenge/HealthWorkoutSheet';
import { AppText } from '@/components/ui/AppText';
import { proofMeta } from '@/lib/constants';
import { copy } from '@/lib/copy';
import {
  cameraIsAvailable,
  ensureCapturePermissions,
  ensureLibraryPermission,
  openAppSettings,
} from '@/lib/mediaPermissions';
import { THEME } from '@/lib/theme';
import type { ProofType } from '@/lib/types';
import { useStartOnWatch } from '@/hooks/useStartOnWatch';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import type { Challenge } from '@/lib/types';

type ProofUploaderProps = {
  type: ProofType;
  uri?: string | null;
  locked?: boolean;
  compact?: boolean;
  autoOpen?: boolean;
  fill?: boolean;
  health?: {
    challengeId: string;
    challengeTitle: string;
    minMinutes?: number | null;
    frequency?: string | null;
    startsAt?: string | null;
    userId?: string;
    attaching?: boolean;
    challenge?: Pick<
      Challenge,
      | 'id'
      | 'title'
      | 'task'
      | 'description'
      | 'rules'
      | 'min_minutes'
      | 'frequency'
      | 'proofs'
      | 'proof_type'
      | 'proof_requirements'
      | 'challenge_type'
      | 'tasks'
    >;
    onAttach: (workout: HealthWorkout) => Promise<void>;
  };
  onPicked: (uri: string, mimeType?: string | null) => void;
  onCancel?: () => void;
  onRequestOpen?: () => void;
};

export function ProofUploader({
  type,
  uri,
  locked = false,
  compact = false,
  autoOpen = false,
  fill = false,
  health,
  onPicked,
  onCancel,
  onRequestOpen,
}: ProofUploaderProps) {
  const meta = proofMeta(type);
  const capture = captureKindForProof(type);
  const video = capture === 'video';
  const [open, setOpen] = useState(autoOpen && !uri && !locked);
  const [blocked, setBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | undefined>();
  const [webFallback, setWebFallback] = useState(false);
  const [libraryDenied, setLibraryDenied] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const healthChip = Boolean(health && getHealthProvider()?.isAvailable());
  const watch = useStartOnWatch(
    health?.challenge ??
      (health
        ? {
            id: health.challengeId,
            title: health.challengeTitle,
            min_minutes: health.minMinutes,
            frequency: health.frequency,
          }
        : null),
  );

  useEffect(() => {
    if (autoOpen && !uri && !locked) {
      void startCamera();
    }
    // First empty still/video proof opens the camera immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  async function startCamera() {
    if (locked) {
      return;
    }
    if (onRequestOpen) {
      onRequestOpen();
      return;
    }
    const permission = await ensureCapturePermissions(capture);
    if (!permission.ok) {
      setBlocked(true);
      setBlockedReason(permission.kind === 'microphone' ? 'Microphone is off.' : 'Camera is off.');
    } else {
      setBlocked(false);
      setBlockedReason(undefined);
      const available = await cameraIsAvailable();
      setWebFallback(!available);
    }
    setOpen(true);
  }

  async function openLibrary() {
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      setLibraryDenied(true);
      return;
    }
    setLibraryDenied(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: video ? ['videos'] : ['images'],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: video ? 30 : undefined,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      onPicked(result.assets[0].uri, result.assets[0].mimeType);
      setOpen(false);
    }
  }

  function closeCamera() {
    setOpen(false);
    onCancel?.();
  }

  const emptyHeight = compact ? 'h-[120px] items-center justify-center px-6' : 'h-[220px] items-center justify-center px-6';
  const previewHeight = compact ? 148 : 280;

  if (open && !locked) {
    return (
      <View
        className={fill ? 'flex-1' : undefined}
        style={
          fill
            ? { flex: 1 }
            : { height: Math.max(previewHeight, 320), borderRadius: THEME.radius, overflow: 'hidden' }
        }>
        <InAppCamera
          capture={capture}
          maxDuration={video ? 30 : 15}
          blocked={blocked}
          blockedReason={blockedReason}
          webFallback={webFallback}
          chromeInset={fill}
          onCaptured={(media) => {
            onPicked(media.uri, media.mimeType);
            setOpen(false);
          }}
          onOpenGallery={() => void openLibrary()}
          onCancel={closeCamera}
          onUnavailable={() => setWebFallback(true)}
          onUseWorkout={healthChip ? () => setHealthOpen(true) : undefined}
          onStartWatch={
            watch.visible
              ? () => {
                  void watch.start().then((result) => {
                    if (result === 'ok') {
                      setToast(copy('health.startedWatch'));
                    } else if (result === 'denied' || result === 'failed') {
                      setToast(copy('health.startWatchFail'));
                    }
                    if (result !== 'cancelled') {
                      setTimeout(
                        () =>
                          setToast((current) =>
                            current === copy('health.startedWatch') ||
                            current === copy('health.startWatchFail')
                              ? null
                              : current,
                          ),
                        2200,
                      );
                    }
                  });
                }
              : undefined
          }
        />
        {health && healthOpen ? (
          <HealthWorkoutSheet
            visible
            challengeId={health.challengeId}
            challengeTitle={health.challengeTitle}
            minMinutes={health.minMinutes}
            frequency={health.frequency}
            startsAt={health.startsAt}
            userId={health.userId}
            attaching={health.attaching}
            onClose={() => setHealthOpen(false)}
            onDenied={() => {
              setHealthOpen(false);
              setToast(copy('health.permissionDenied'));
              setTimeout(() => setToast((current) => (current === copy('health.permissionDenied') ? null : current)), 2200);
            }}
            onAttach={health.onAttach}
          />
        ) : null}
        {toast ? (
          <View
            pointerEvents="none"
            className="absolute left-4 right-4 items-center"
            style={{ bottom: fill ? 108 : 28 }}>
            <View
              className="px-4 py-2.5"
              style={{ backgroundColor: 'rgba(16,19,18,0.88)', borderRadius: 16 }}>
              <AppText className="text-[13px] font-semibold" style={{ color: '#fff' }}>
                {toast}
              </AppText>
            </View>
          </View>
        ) : null}
        {libraryDenied ? (
          <View
            className="absolute left-4 right-4 flex-row items-center justify-between rounded-2xl px-3 py-2"
            style={{ bottom: fill ? 96 : 24, backgroundColor: 'rgba(16,19,18,0.88)' }}>
            <AppText className="mr-3 flex-1 text-[12px] font-semibold" style={{ color: '#fff' }}>
              Photo library is off.
            </AppText>
            {Platform.OS !== 'web' ? (
              <Pressable onPress={() => void openAppSettings()}>
                <AppText className="text-[12px] font-bold" style={{ color: THEME.accentBright }}>
                  Open Settings
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      className="overflow-hidden"
      style={{
        borderRadius: THEME.radius,
        borderWidth: 1.5,
        borderStyle: uri ? 'solid' : 'dashed',
        borderColor: uri ? THEME.accent : THEME.border,
        backgroundColor: THEME.surface,
      }}>
      {uri && video ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retake video"
          disabled={locked}
          onPress={() => void startCamera()}
          className={emptyHeight}
          style={{ minHeight: previewHeight }}>
          <AppText className="text-center text-base font-semibold text-charcoal">
            Video attached
          </AppText>
          <AppText className="mt-2 text-center text-sm leading-6 text-muted">
            {meta.helper}
          </AppText>
        </Pressable>
      ) : uri ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retake photo"
          disabled={locked}
          onPress={() => void startCamera()}>
          <Image
            source={{ uri }}
            style={{ height: previewHeight, width: '100%' }}
            contentFit="contain"
          />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={video ? 'Record video' : 'Take photo'}
          disabled={locked}
          onPress={() => void startCamera()}
          className={emptyHeight}>
          <AppText className="text-center text-base font-semibold text-charcoal">
            {meta.label}
          </AppText>
          <AppText className="mt-2 text-center text-sm leading-6 text-muted">
            {meta.helper}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
