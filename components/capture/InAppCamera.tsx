import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lastCameraFacing, rememberCameraFacing } from '@/components/capture/cameraFacing';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import {
  cameraErrorKind,
  logCameraError,
  openWebCameraStream,
  takePrimedCameraStream,
} from '@/lib/cameraSession';
import { copy } from '@/lib/copy';
import {
  ensureCapturePermissions,
  openAppSettings,
  queryWebCameraPermission,
} from '@/lib/mediaPermissions';
import { THEME, TAB_BAR_PEEK } from '@/lib/theme';
import type { CapturedMedia, CaptureMedia } from '@/components/capture/types';

type CameraFail = 'denied' | 'missing' | null;

type InAppCameraProps = {
  capture: CaptureMedia;
  maxDuration: number;
  blocked?: boolean;
  blockedReason?: string;
  webFallback?: boolean;
  chromeInset?: boolean;
  allowModeToggle?: boolean;
  deniedTitle?: string;
  onCaptured: (media: CapturedMedia) => void;
  onOpenGallery: () => void;
  onCancel: () => void;
  onUnavailable?: () => void;
  onUseWorkout?: () => void;
  onStartWatch?: () => void;
  hrScreenshot?: boolean;
};

export function InAppCamera({
  capture: captureProp,
  maxDuration,
  blocked = false,
  blockedReason,
  webFallback = false,
  chromeInset = true,
  allowModeToggle = false,
  deniedTitle,
  onCaptured,
  onOpenGallery,
  onCancel,
  onUnavailable,
  onUseWorkout,
  onStartWatch,
  hrScreenshot = false,
}: InAppCameraProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<CameraType>(() => lastCameraFacing());
  const [capture, setCapture] = useState<CaptureMedia>(captureProp);
  const [ready, setReady] = useState(false);
  const [fail, setFail] = useState<CameraFail>(null);
  const [retry, setRetry] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  const holdRef = useRef(false);
  const skipPressRef = useRef(false);
  const video = capture === 'video';
  const web = Platform.OS === 'web';
  const parentBlocked = blocked || webFallback;
  const live = !parentBlocked && fail == null && ready;
  const shutterEnabled = live && !busy;
  const bottomPad = chromeInset ? TAB_BAR_PEEK : Math.max(insets.bottom, 16) + 8;
  const needCopy = deniedTitle ?? 'Camera is off.';

  useEffect(() => {
    setCapture(captureProp);
  }, [captureProp]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFail(null);

    void (async () => {
      if (parentBlocked) {
        return;
      }
      if (web) {
        try {
          const queried = await queryWebCameraPermission();
          if (cancelled) {
            return;
          }
          const primed = takePrimedCameraStream();
          if (queried === 'denied' && !primed) {
            setFail('denied');
            return;
          }
          const stream = await openWebCameraStream({
            facing: facing === 'front' ? 'front' : 'back',
            audio: video,
            existing: primed,
          });
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          webStreamRef.current = stream;
          const node = webVideoRef.current;
          if (node) {
            node.srcObject = stream;
            void node.play().catch((error) => logCameraError(error, 'video.play'));
          }
          setReady(true);
          setFail(null);
        } catch (error) {
          logCameraError(error, 'web stream');
          if (cancelled) {
            return;
          }
          setFail(cameraErrorKind(error) === 'missing' ? 'missing' : 'denied');
        }
        return;
      }

      const permission = await ensureCapturePermissions(video ? 'video' : 'photo');
      if (cancelled) {
        return;
      }
      if (!permission.ok) {
        setFail(permission.kind === 'camera' || permission.kind === 'microphone' ? 'denied' : 'denied');
      }
    })();

    return () => {
      cancelled = true;
      if (web) {
        webStreamRef.current?.getTracks().forEach((track) => track.stop());
        webStreamRef.current = null;
        const node = webVideoRef.current;
        if (node) {
          node.srcObject = null;
        }
      }
    };
  }, [facing, parentBlocked, retry, video, web]);

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.min(maxDuration, (Date.now() - started) / 1000));
    }, 80);
    return () => clearInterval(tick);
  }, [maxDuration, recording]);

  function attachWebVideo(node: HTMLVideoElement | null) {
    webVideoRef.current = node;
    if (node && webStreamRef.current) {
      node.srcObject = webStreamRef.current;
      void node.play().catch((error) => logCameraError(error, 'video.attach'));
    }
  }

  async function takePhoto() {
    if (!shutterEnabled) {
      return;
    }
    setBusy(true);
    try {
      if (web) {
        const node = webVideoRef.current;
        if (!node || node.videoWidth <= 0) {
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = node.videoWidth;
        canvas.height = node.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(node, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
        if (!blob) {
          return;
        }
        onCaptured({
          uri: URL.createObjectURL(blob),
          mediaType: 'image',
          mimeType: 'image/jpeg',
          blob,
        });
        return;
      }
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (photo?.uri) {
        onCaptured({
          uri: photo.uri,
          mediaType: 'image',
          mimeType: 'image/jpeg',
          blob: null,
        });
      }
    } catch (error) {
      logCameraError(error, 'takePhoto');
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (!shutterEnabled || !video || recordingRef.current) {
      return;
    }
    if (web) {
      const stream = webStreamRef.current;
      if (!stream) {
        return;
      }
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
      chunksRef.current = [];
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      const startedAt = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        recordingRef.current = false;
        setRecording(false);
        holdRef.current = false;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        if (blob.size > 0) {
          onCaptured({
            uri: URL.createObjectURL(blob),
            mediaType: 'video',
            mimeType: blob.type || 'video/webm',
            blob,
            durationMs: Date.now() - startedAt,
          });
        }
      };
      recordingRef.current = true;
      setRecording(true);
      recorder.start(250);
      window.setTimeout(() => {
        if (recorderRef.current === recorder && recorder.state === 'recording') {
          recorder.stop();
        }
      }, maxDuration * 1000);
      return;
    }
    if (!cameraRef.current) {
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
    } catch (error) {
      logCameraError(error, 'recordAsync');
    } finally {
      recordingRef.current = false;
      setRecording(false);
      holdRef.current = false;
    }
  }

  function stopRecording() {
    if (!recordingRef.current) {
      return;
    }
    if (web) {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
      return;
    }
    cameraRef.current?.stopRecording();
  }

  function onShutterPress() {
    if (skipPressRef.current || holdRef.current) {
      skipPressRef.current = false;
      return;
    }
    if (!shutterEnabled && !recordingRef.current) {
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
  const showDenied = parentBlocked || fail != null;
  const deniedLine = webFallback
    ? needCopy
    : fail === 'missing'
      ? needCopy
      : blockedReason ?? needCopy;

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: THEME.primary }}>
      {web && !parentBlocked && fail == null ? (
        <View style={{ flex: 1 }}>
          {createElement('video', {
            ref: attachWebVideo,
            autoPlay: true,
            muted: true,
            playsInline: true,
            style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#101312' },
          })}
        </View>
      ) : !showDenied ? (
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          mode={video ? 'video' : 'picture'}
          mute={false}
          onCameraReady={() => {
            setReady(true);
            setFail(null);
          }}
          onMountError={(event) => {
            const message = String((event as { message?: string })?.message ?? event ?? '');
            const synthetic = new Error(message);
            if (message.toLowerCase().includes('allow')) {
              synthetic.name = 'NotAllowedError';
            } else if (message.toLowerCase().includes('found') || message.toLowerCase().includes('device')) {
              synthetic.name = 'NotFoundError';
            }
            logCameraError(synthetic, 'onMountError');
            const kind = cameraErrorKind(synthetic);
            if (kind === 'missing') {
              setFail('missing');
              onUnavailable?.();
              return;
            }
            setFail('denied');
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-[16px] font-bold" style={{ color: '#fff' }}>
            {needCopy}
          </AppText>
          <AppText className="mt-2 text-center text-[13px]" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {deniedLine === needCopy ? 'Open Settings to turn the camera on.' : deniedLine}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void openAppSettings().then(() => {
                setFail(null);
                setReady(false);
                setRetry((value) => value + 1);
              });
            }}
            className="mt-4 items-center justify-center rounded-full px-4"
            style={{ minHeight: 44, backgroundColor: 'rgba(255,255,255,0.16)' }}>
            <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
              Open Settings
            </AppText>
          </Pressable>
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
        <AppText className="text-[12px] font-semibold" style={{ color: '#fff' }}>
          {recording ? `${Math.ceil(elapsed)}s / ${maxDuration}s` : `${maxDuration}s`}
        </AppText>
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

      <View className="absolute left-6 right-6" style={{ bottom: bottomPad }}>
        {hrScreenshot ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="HR screenshot"
            onPress={onOpenGallery}
            className="mb-3 self-center items-center justify-center rounded-full px-4"
            style={{
              minHeight: 44,
              backgroundColor: 'rgba(16,19,18,0.72)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
            }}>
            <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
              HR screenshot
            </AppText>
          </Pressable>
        ) : null}
        {allowModeToggle ? (
          <View className="mb-3 flex-row items-center justify-center" style={{ gap: 18 }}>
            <Pressable accessibilityRole="button" onPress={() => setCapture('photo')}>
              <AppText
                className="text-[13px] font-extrabold"
                style={{ color: capture === 'photo' ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                Photo
              </AppText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setCapture('video')}>
              <AppText
                className="text-[13px] font-extrabold"
                style={{ color: capture === 'video' ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                Video
              </AppText>
            </Pressable>
          </View>
        ) : null}
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open gallery"
            onPress={onOpenGallery}
            className="h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(16,19,18,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
            <Glyph name={GLYPH.album} color="#fff" size={22} />
          </Pressable>

          <View style={{ width: 82, height: 82, alignItems: 'center', justifyContent: 'center' }}>
            {video ? (
              <ShutterRing progress={recording ? elapsed / maxDuration : 0} />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={shutterLabel}
              disabled={!shutterEnabled && !recording}
              delayLongPress={180}
              onPress={onShutterPress}
              onLongPress={onShutterLongPress}
              onPressOut={onShutterPressOut}
              style={{
                position: 'absolute',
                width: 74,
                height: 74,
                minWidth: 44,
                minHeight: 44,
                borderRadius: 37,
                borderWidth: 4,
                borderColor: '#fff',
                backgroundColor: video ? THEME.danger : '#fff',
                opacity: shutterEnabled || recording ? 1 : 0.45,
              }}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            disabled={showDenied}
            onPress={() =>
              setFacing((current) => {
                const next = current === 'back' ? 'front' : 'back';
                rememberCameraFacing(next);
                return next;
              })
            }
            className="h-12 w-12 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: 'rgba(16,19,18,0.72)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              opacity: showDenied ? 0.4 : 1,
            }}>
            <AppText className="text-[11px] font-extrabold" style={{ color: '#fff' }}>
              Flip
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ShutterRing({ progress }: { progress: number }) {
  const size = 82;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.28)"
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#fff"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={circ * (1 - clamped)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
