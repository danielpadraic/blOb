import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';

import { lastCameraFacing, rememberCameraFacing } from '@/components/capture/cameraFacing';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { openAppSettings } from '@/lib/mediaPermissions';
import type { CapturedMedia } from '@/components/capture/types';

export type CameraCaptureKind = 'photo' | 'video' | 'mixed';

type InAppCameraProps = {
  capture: CameraCaptureKind;
  maxDuration: number;
  blocked?: boolean;
  blockedReason?: string;
  webFallback?: boolean;
  onCaptured: (media: CapturedMedia) => void;
  onOpenGallery: () => void;
  onCancel: () => void;
  onUnavailable: () => void;
};

export function InAppCamera({
  capture,
  maxDuration,
  blocked = false,
  blockedReason,
  webFallback = false,
  onCaptured,
  onOpenGallery,
  onCancel,
  onUnavailable,
}: InAppCameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>(lastCameraFacing);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  const holdRef = useRef(false);
  const skipPressRef = useRef(false);
  const videoMode = capture === 'video' || capture === 'mixed';
  const live = !blocked && !webFallback;

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, [recording]);

  async function takePhoto() {
    if (!live || !ready || busy || !cameraRef.current) {
      return;
    }
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (photo?.uri) {
        onCaptured({
          uri: photo.uri,
          mediaType: 'image',
          mimeType: 'image/jpeg',
          blob: null,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (!live || !ready || !cameraRef.current || recordingRef.current) {
      return;
    }
    if (Platform.OS === 'web') {
      onUnavailable();
      return;
    }
    recordingRef.current = true;
    setRecording(true);
    const startedAt = Date.now();
    try {
      const clip = await cameraRef.current.recordAsync({ maxDuration });
      if (clip?.uri) {
        onCaptured({
          uri: clip.uri,
          mediaType: 'video',
          mimeType: 'video/mp4',
          blob: null,
          durationMs: Date.now() - startedAt,
        });
      }
    } finally {
      recordingRef.current = false;
      setRecording(false);
      holdRef.current = false;
    }
  }

  function stopRecording() {
    if (!recordingRef.current || !cameraRef.current) {
      return;
    }
    cameraRef.current.stopRecording();
  }

  function onShutterPress() {
    if (skipPressRef.current || holdRef.current) {
      skipPressRef.current = false;
      return;
    }
    if (capture === 'video') {
      if (recordingRef.current) {
        stopRecording();
        return;
      }
      void startRecording();
      return;
    }
    void takePhoto();
  }

  function onShutterLongPress() {
    if (!videoMode) {
      return;
    }
    skipPressRef.current = true;
    holdRef.current = true;
    if (!recordingRef.current) {
      void startRecording();
    }
  }

  function onShutterPressOut() {
    if (holdRef.current && recordingRef.current) {
      stopRecording();
    }
  }

  const shutterLabel =
    capture === 'video' || recording
      ? recording
        ? 'Stop recording'
        : 'Start recording'
      : 'Take photo';

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: THEME.primary }}>
      {live ? (
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          mode={capture === 'photo' ? 'picture' : 'video'}
          mute={false}
          onCameraReady={() => setReady(true)}
          onMountError={() => onUnavailable()}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-[14px] font-semibold" style={{ color: '#fff' }}>
            {webFallback
              ? 'Use gallery'
              : blockedReason ?? 'Camera is off. Turn it on in Settings.'}
          </AppText>
          {webFallback ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void openAppSettings()}
              className="mt-3 rounded-full px-4 py-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
                Open Settings
              </AppText>
            </Pressable>
          )}
        </View>
      )}

      <View className="absolute left-3 right-3 top-3 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          onPress={onCancel}
          className="h-9 items-center justify-center rounded-full px-3"
          style={{ backgroundColor: 'rgba(16,19,18,0.72)' }}>
          <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
            Close
          </AppText>
        </Pressable>
        {recording ? (
          <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: THEME.danger }}>
            <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
              {elapsed}s / {maxDuration}s
            </AppText>
          </View>
        ) : (
          <AppText className="text-[12px] font-semibold" style={{ color: '#fff' }}>
            {capture === 'video' ? `Up to ${maxDuration}s` : capture === 'mixed' ? 'Tap photo · hold video' : 'Photo'}
          </AppText>
        )}
        <View style={{ width: 64 }} />
      </View>

      <View className="absolute bottom-5 left-6 right-6 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open gallery"
          onPress={onOpenGallery}
          className="h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'rgba(16,19,18,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
          <Glyph name={GLYPH.album} color="#fff" size={22} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shutterLabel}
          disabled={(!ready && live) || busy}
          delayLongPress={180}
          onPress={onShutterPress}
          onLongPress={onShutterLongPress}
          onPressOut={onShutterPressOut}
          style={{
            width: 74,
            height: 74,
            borderRadius: 37,
            borderWidth: 4,
            borderColor: '#fff',
            backgroundColor: recording ? THEME.danger : '#fff',
            opacity: live && ready ? 1 : 0.45,
          }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
          disabled={!live}
          onPress={() =>
            setFacing((current) => {
              const next = current === 'back' ? 'front' : 'back';
              rememberCameraFacing(next);
              return next;
            })
          }
          className="h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'rgba(16,19,18,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
          <AppText className="text-[11px] font-extrabold" style={{ color: '#fff' }}>
            Flip
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
