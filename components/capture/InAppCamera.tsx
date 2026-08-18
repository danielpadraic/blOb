import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import type { CapturedMedia } from '@/components/capture/types';

type InAppCameraProps = {
  media: 'photo' | 'video';
  maxDuration: number;
  onCaptured: (media: CapturedMedia) => void;
  onCancel: () => void;
  onUnavailable: () => void;
};

export function InAppCamera({ media, maxDuration, onCaptured, onCancel, onUnavailable }: InAppCameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);

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
    if (!ready || busy || !cameraRef.current) {
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

  async function toggleRecord() {
    if (!ready || !cameraRef.current) {
      return;
    }
    if (Platform.OS === 'web') {
      onUnavailable();
      return;
    }
    if (recordingRef.current) {
      cameraRef.current.stopRecording();
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
    }
  }

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: THEME.primary, borderRadius: THEME.radius }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        mode={media === 'video' ? 'video' : 'picture'}
        mute={false}
        onCameraReady={() => setReady(true)}
        onMountError={() => onUnavailable()}
      />
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
            {media === 'video' ? `Up to ${maxDuration}s` : 'Photo'}
          </AppText>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
          onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
          className="h-9 items-center justify-center rounded-full px-3"
          style={{ backgroundColor: 'rgba(16,19,18,0.72)' }}>
          <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
            Flip
          </AppText>
        </Pressable>
      </View>
      <View className="absolute bottom-4 left-0 right-0 items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={media === 'video' ? (recording ? 'Stop recording' : 'Start recording') : 'Take photo'}
          disabled={!ready || busy}
          onPress={() => void (media === 'video' ? toggleRecord() : takePhoto())}
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            borderWidth: 4,
            borderColor: '#fff',
            backgroundColor: recording ? THEME.danger : '#fff',
            opacity: ready ? 1 : 0.5,
          }}
        />
      </View>
    </View>
  );
}
