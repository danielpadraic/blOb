import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { InAppCamera } from '@/components/capture/InAppCamera';
import { captureKindForProof } from '@/components/capture/types';
import { AppText } from '@/components/ui/AppText';
import { proofMeta } from '@/lib/constants';
import {
  cameraIsAvailable,
  ensureCapturePermissions,
  ensureLibraryPermission,
  openAppSettings,
} from '@/lib/mediaPermissions';
import { THEME } from '@/lib/theme';
import type { ProofType } from '@/lib/types';

type ProofUploaderProps = {
  type: ProofType;
  uri?: string | null;
  locked?: boolean;
  compact?: boolean;
  autoOpen?: boolean;
  fill?: boolean;
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
        />
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
