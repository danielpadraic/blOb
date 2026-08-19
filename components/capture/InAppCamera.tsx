import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';

import { lastCameraFacing, rememberCameraFacing } from '@/components/capture/cameraFacing';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME, TAB_BAR_PEEK } from '@/lib/theme';
import { openAppSettings } from '@/lib/mediaPermissions';
import type { CapturedMedia, CaptureMedia } from '@/components/capture/types';

type InAppCameraProps = {
  capture: CaptureMedia;
  maxDuration: number;
  blocked?: boolean;
  blockedReason?: string;
  webFallback?: boolean;
  /** Keep shutter/gallery/flip in the gap above the floating tab bar. */
  chromeInset?: boolean;
  onCaptured: (media: CapturedMedia) => void;
  onOpenGallery: () => void;
  onCancel: () => void;
  onUnavailable: () => void;
  onUseWorkout?: () => void;
  onStartWatch?: () => void;
};

export function InAppCamera({
  capture,
  maxDuration,
  blocked = false,
  blockedReason,
  webFallback = false,
  chromeInset = true,
  onCaptured,
  onOpenGallery,
  onCancel,
  onUnavailable,
  onUseWorkout,
  onStartWatch,
}: InAppCameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>(() => lastCameraFacing());
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  const holdRef = useRef(false);
  const skipPressRef = useRef(false);
  const video = capture === 'video';
  const live = !blocked && !webFallback;
  const bottomPad = chromeInset ? TAB_BAR_PEEK : 20;

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
    if (!live || !ready || !video || !cameraRef.current || recordingRef.current) {
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
    if (video) {
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
    if (!video) {
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

  const shutterLabel = video
    ? recording
      ? 'Stop recording'
      : 'Start recording'
    : 'Take photo';
  const deniedLine = webFallback
    ? 'Camera isn’t available.'
    : blockedReason ?? 'Camera is off.';

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: THEME.primary }}>
      {live ? (
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          mode={video ? 'video' : 'picture'}
          mute={false}
          onCameraReady={() => setReady(true)}
          onMountError={() => onUnavailable()}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-[14px] font-semibold" style={{ color: '#fff' }}>
            {deniedLine}
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
        {video ? (
          recording ? (
            <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: THEME.danger }}>
              <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
                {elapsed}s / {maxDuration}s
              </AppText>
            </View>
          ) : (
            <AppText className="text-[12px] font-semibold" style={{ color: '#fff' }}>
              {maxDuration}s
            </AppText>
          )
        ) : (
          <View />
        )}
        {onUseWorkout || onStartWatch ? (
          <View className="items-end" style={{ gap: 8, maxWidth: 168 }}>
            {onUseWorkout ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy('health.chip')}
                onPress={onUseWorkout}
                className="items-center justify-center rounded-full px-3"
                style={{
                  minHeight: 44,
                  backgroundColor: 'rgba(16,19,18,0.72)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                }}>
                <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
                  {copy('health.chip')}
                </AppText>
              </Pressable>
            ) : null}
            {onStartWatch ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy('health.startWatch')}
                onPress={onStartWatch}
                className="items-center justify-center rounded-full px-3"
                style={{
                  minHeight: 44,
                  backgroundColor: 'rgba(16,19,18,0.72)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                }}>
                <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
                  {copy('health.startWatch')}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <View
        className="absolute left-6 right-6 flex-row items-center justify-between"
        style={{ bottom: bottomPad }}>
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
