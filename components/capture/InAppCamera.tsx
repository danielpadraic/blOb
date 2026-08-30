import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { AppState, BackHandler, Platform, Pressable, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Camera, CameraView, type CameraMountError, type CameraType } from 'expo-camera';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  lastCameraFacing,
  rememberCameraFacing,
  type CameraFacingKind,
} from '@/components/capture/cameraFacing';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import {
  cameraErrorKind,
  logCameraError,
  markWebCameraGranted,
  openWebCameraStream,
  registerNativeCameraStop,
  stopMedia,
  stopPrimedCameraStream,
  takePrimedCameraStream,
  watchLiveMedia,
  webCameraGrantedThisSession,
} from '@/lib/cameraSession';
import { copy } from '@/lib/copy';
import { capHaptic } from '@/lib/haptics';
import { cameraAskLine, resolveCameraAsk, type CameraAsk } from '@/lib/cameraAsk';
import {
  ensureMicrophonePermission,
  openAppSettings,
  queryWebCameraPermission,
  webMediaRecorderAvailable,
} from '@/lib/mediaPermissions';
import { clipShutterReleaseStopsRecording } from '@/lib/clipShutter';
import { THEME, TAB_BAR_PEEK } from '@/lib/theme';
import { applyWebVideoLock } from '@/lib/webVideo';
import type { CapturedMedia, CaptureMedia } from '@/components/capture/types';

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
  faceHint?: string | null;
  facingKind?: CameraFacingKind;
  /** When set, show tick marks at this interval (seconds) while recording. */
  clipTickSec?: number;
  shutterHint?: string;
  /** Check-in stills: Close / shutter / Flip only. No Wave recorder chrome. */
  checkin?: boolean;
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
  faceHint = null,
  facingKind = 'proof',
  clipTickSec: _clipTickSec,
  shutterHint,
  checkin = false,
}: InAppCameraProps) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [sessionOn, setSessionOn] = useState(true);
  const focusedRef = useRef(focused);
  const chunksRef = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<CameraType>(() => lastCameraFacing(facingKind));
  const [capture, setCapture] = useState<CaptureMedia>(checkin ? 'photo' : captureProp);
  const [, setReady] = useState(false);
  const [ask, setAsk] = useState<CameraAsk>('prompt');
  const [retry, setRetry] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  const holdRef = useRef(false);
  const skipPressRef = useRef(false);
  const video = !checkin && capture === 'video';
  const web = Platform.OS === 'web';
  const parentBlocked = blocked || webFallback;
  const readyPreview = !parentBlocked && ask === 'ready';
  const shutterEnabled = readyPreview && !busy;
  const shutterOpaque = recording || readyPreview;
  const bottomPad = chromeInset ? TAB_BAR_PEEK : Math.max(insets.bottom, 16) + 8;
  const askLine =
    parentBlocked
      ? deniedTitle ?? blockedReason ?? (webFallback ? 'Camera isn’t available here.' : 'Turn on camera in Settings.')
      : cameraAskLine(ask, checkin);

  useEffect(() => {
    setCapture(checkin ? 'photo' : captureProp);
  }, [captureProp, checkin]);

  function killSession() {
    stopMedia({
      stream: webStreamRef.current,
      video: webVideoRef.current,
      recorder: recorderRef.current,
    });
    webStreamRef.current = null;
    recorderRef.current = null;
    stopPrimedCameraStream();
    if (recordingRef.current && !web) {
      cameraRef.current?.stopRecording();
    }
    setSessionOn(false);
  }

  useEffect(() => {
    return registerNativeCameraStop(() => {
      stopMedia({
        stream: webStreamRef.current,
        video: webVideoRef.current,
        recorder: recorderRef.current,
      });
      webStreamRef.current = null;
      recorderRef.current = null;
      stopPrimedCameraStream();
      cameraRef.current?.stopRecording();
      setSessionOn(false);
    });
  }, []);

  useEffect(() => {
    if (!focused) {
      killSession();
    } else if (!focusedRef.current) {
      setSessionOn(true);
      setRetry((value) => value + 1);
    }
    focusedRef.current = focused;
  }, [focused]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        killSession();
        return;
      }
      if (focusedRef.current) {
        setSessionOn(true);
        setRetry((value) => value + 1);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        killSession();
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setAsk('prompt');

    void (async () => {
      if (parentBlocked || !focused || !sessionOn) {
        return;
      }
      if (web) {
        const queried = webCameraGrantedThisSession()
          ? 'granted'
          : await queryWebCameraPermission();
        if (cancelled) {
          return;
        }
        setAsk(resolveCameraAsk({ queried }));
        if (queried === 'denied') {
          return;
        }
        try {
          const primed = video ? takePrimedCameraStream() : null;
          if (!video) {
            stopPrimedCameraStream();
          }
          const stream = await openWebCameraStream({
            facing: facing === 'front' ? 'front' : 'back',
            audio: video,
            existing: primed,
          });
          if (cancelled || !focusedRef.current) {
            stopMedia({ stream });
            return;
          }
          markWebCameraGranted();
          webStreamRef.current = stream;
          watchLiveMedia({ stream });
          const node = webVideoRef.current;
          if (node) {
            node.srcObject = stream;
            watchLiveMedia({ video: node });
            void node.play().catch((error) => logCameraError(error, 'video.play'));
          }
          setReady(true);
          setAsk('ready');
        } catch (error) {
          logCameraError(error, 'web stream');
          if (cancelled) {
            return;
          }
          setAsk(resolveCameraAsk({ queried, errorKind: cameraErrorKind(error) }));
        }
        return;
      }

      const current = await Camera.getCameraPermissionsAsync();
      if (cancelled) {
        return;
      }
      if (!current.granted) {
        setAsk(current.canAskAgain === false ? 'denied' : 'prompt');
        if (current.canAskAgain === false) {
          return;
        }
        const next = await Camera.requestCameraPermissionsAsync();
        if (cancelled) {
          return;
        }
        if (!next.granted) {
          setAsk('denied');
          return;
        }
      }
      if (video) {
        const mic = await ensureMicrophonePermission();
        if (cancelled) {
          return;
        }
        if (!mic.ok && !mic.canAskAgain) {
          setAsk('denied');
          return;
        }
      }
      setReady(true);
      setAsk('ready');
    })();

    return () => {
      cancelled = true;
      stopMedia({
        stream: webStreamRef.current,
        video: webVideoRef.current,
        recorder: recorderRef.current,
      });
      webStreamRef.current = null;
      recorderRef.current = null;
    };
  }, [facing, focused, parentBlocked, retry, sessionOn, video, web]);

  useEffect(() => {
    if (parentBlocked || ask !== 'ready') {
      return;
    }
    const timer = setTimeout(() => {
      setReady(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [ask, facing, parentBlocked, retry, web]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCamera();
      return true;
    });
    return () => sub.remove();
  }, [onCancel]);

  const attachWebVideo = useCallback((node: HTMLVideoElement | null) => {
    webVideoRef.current = node;
    const stream = webStreamRef.current;
    if (!node || !stream) {
      return;
    }
    if (node.srcObject !== stream) {
      node.srcObject = stream;
      watchLiveMedia({ video: node, stream });
      void node.play().catch((error) => logCameraError(error, 'video.attach'));
    }
  }, []);

  const onCameraReady = useCallback(() => {
    setReady(true);
    setAsk('ready');
  }, []);

  async function waitOneFrame() {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function waitWebVideoFrame(node: HTMLVideoElement) {
    if (node.videoWidth > 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      const finish = () => {
        node.removeEventListener('loadedmetadata', finish);
        resolve();
      };
      node.addEventListener('loadedmetadata', finish);
      setTimeout(finish, 1200);
    });
  }

  const onCameraDenied = useCallback(() => setAsk('denied'), []);
  const onCameraMissing = useCallback(() => setAsk('error'), []);

  function closeCamera() {
    killSession();
    onCancel();
  }

  async function takePhoto() {
    if (!shutterEnabled) {
      return;
    }
    setBusy(true);
    try {
      if (web) {
        const node = webVideoRef.current;
        if (!node) {
          return;
        }
        if (node.videoWidth <= 0) {
          await waitWebVideoFrame(node);
        }
        if (node.videoWidth <= 0) {
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
        killSession();
        return;
      }
      let photo = await cameraRef.current?.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (!photo?.uri) {
        await waitOneFrame();
        photo = await cameraRef.current?.takePictureAsync({ quality: 0.8, shutterSound: false });
      }
      if (photo?.uri) {
        onCaptured({
          uri: photo.uri,
          mediaType: 'image',
          mimeType: 'image/jpeg',
          blob: null,
        });
        killSession();
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
      if (!webMediaRecorderAvailable()) {
        onUnavailable?.();
        return;
      }
      const mime =
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';
      chunksRef.current = [];
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      watchLiveMedia({ recorder, stream });
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
        recorderRef.current = null;
        killSession();
      };
      recordingRef.current = true;
      setRecording(true);
      try {
        recorder.start(250);
      } catch (error) {
        recordingRef.current = false;
        setRecording(false);
        logCameraError(error, 'MediaRecorder.start');
        onUnavailable?.();
        return;
      }
      window.setTimeout(() => {
        if (recorderRef.current === recorder && recorder.state === 'recording') {
          void capHaptic();
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
      if (Date.now() - startedAt >= maxDuration * 1000 - 400) {
        void capHaptic();
      }
      if (clip?.uri) {
        onCaptured({
          uri: clip.uri,
          mediaType: 'video',
          mimeType: 'video/mp4',
          blob: null,
          durationMs: Date.now() - startedAt,
        });
        killSession();
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
      } else {
        recorderRef.current = null;
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
    if (clipShutterReleaseStopsRecording() && holdRef.current && recordingRef.current) {
      stopRecording();
    }
  }

  const liveHint = checkin ? undefined : video && recording ? copy('wave.shutterStop') : shutterHint;
  const shutterLabel = liveHint
    ? liveHint
    : video
      ? recording
        ? 'Tap to stop'
        : 'Start recording'
      : 'Take photo';
  const showDenied = parentBlocked || ask === 'denied';
  const showRetry = !parentBlocked && ask === 'error';
  const showFrame = sessionOn && focused && !showDenied;

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: THEME.primary }}>
      {showFrame && web ? (
        <WebCameraPreview attach={attachWebVideo} />
      ) : showFrame && ask === 'ready' ? (
        <NativeCameraPreview
          cameraRef={cameraRef}
          facing={facing}
          video={video}
          onReady={onCameraReady}
          onUnavailable={onUnavailable}
          onDenied={onCameraDenied}
          onMissing={onCameraMissing}
        />
      ) : (
        <View className="flex-1" style={{ backgroundColor: THEME.primary }} />
      )}
      {askLine ? (
        <View
          pointerEvents="box-none"
          className="absolute left-6 right-6 items-center"
          style={{ top: Math.max(insets.top, 12) + 56, zIndex: 3 }}>
          <AppText className="text-center text-[15px] font-semibold" style={{ color: '#fff' }}>
            {askLine}
          </AppText>
          {showDenied ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void openAppSettings().then(() => {
                  setAsk('prompt');
                  setReady(false);
                  setRetry((value) => value + 1);
                });
              }}
              className="mt-3 items-center justify-center rounded-full px-4"
              style={{ minHeight: 44, backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
                Open Settings
              </AppText>
            </Pressable>
          ) : null}
          {showRetry ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setAsk('prompt');
                setReady(false);
                setRetry((value) => value + 1);
              }}
              className="mt-3 items-center justify-center rounded-full px-4"
              style={{ minHeight: 44, backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
                Retry
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View
        className="absolute left-3 right-3 flex-row items-center justify-between"
        style={{ top: Math.max(insets.top, 12) + 4, zIndex: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          onPress={closeCamera}
          className="h-9 items-center justify-center rounded-full px-3"
          style={{ backgroundColor: 'rgba(16,19,18,0.72)' }}>
          <AppText className="text-[13px] font-bold" style={{ color: '#fff' }}>
            Close
          </AppText>
        </Pressable>
        <View style={{ minWidth: 64 }} />
        {!checkin && (onUseWorkout || onStartWatch) ? (
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
        {faceHint && !hrScreenshot && !checkin ? (
          <AppText className="mb-3 text-center text-[13px] font-semibold" style={{ color: '#fff' }}>
            {faceHint}
          </AppText>
        ) : null}
        {hrScreenshot && !checkin ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Heart-rate screenshot"
            onPress={onOpenGallery}
            className="mb-3 self-center items-center justify-center rounded-full px-4"
            style={{
              minHeight: 44,
              backgroundColor: 'rgba(16,19,18,0.72)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
            }}>
            <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
              Heart-rate screenshot
            </AppText>
          </Pressable>
        ) : null}
        {allowModeToggle && !checkin ? (
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
        {liveHint ? (
          <AppText className="mb-2 text-center text-[13px] font-semibold" style={{ color: '#fff' }}>
            {liveHint}
          </AppText>
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
            {video ? <RecordingRing recording={recording} maxDuration={maxDuration} /> : null}
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
                backgroundColor: video ? '#FF3B30' : '#fff',
                opacity: shutterOpaque ? 1 : 0.45,
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
                rememberCameraFacing(next, facingKind);
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

function useRecordingElapsed(recording: boolean, maxDuration: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.min(maxDuration, (Date.now() - started) / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, [maxDuration, recording]);
  return elapsed;
}

const WebCameraPreview = memo(function WebCameraPreview({
  attach,
}: {
  attach: (node: HTMLVideoElement | null) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      {createElement('video', {
        ref: (node: HTMLVideoElement | null) => {
          applyWebVideoLock(node);
          attach(node);
        },
        autoPlay: true,
        muted: true,
        playsInline: true,
        controls: false,
        disablePictureInPicture: true,
        'webkit-playsinline': 'true',
        style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#101312' },
      })}
    </View>
  );
});

const NativeCameraPreview = memo(function NativeCameraPreview({
  cameraRef,
  facing,
  video,
  onReady,
  onUnavailable,
  onDenied,
  onMissing,
}: {
  cameraRef: RefObject<CameraView | null>;
  facing: CameraType;
  video: boolean;
  onReady: () => void;
  onUnavailable?: () => void;
  onDenied: () => void;
  onMissing: () => void;
}) {
  const onReadyRef = useRef(onReady);
  const onUnavailableRef = useRef(onUnavailable);
  const onDeniedRef = useRef(onDenied);
  const onMissingRef = useRef(onMissing);
  onReadyRef.current = onReady;
  onUnavailableRef.current = onUnavailable;
  onDeniedRef.current = onDenied;
  onMissingRef.current = onMissing;

  const handleReady = useCallback(() => {
    onReadyRef.current();
  }, []);

  const handleMountError = useCallback((event: CameraMountError) => {
    const message = String(event?.message ?? '');
    const synthetic = new Error(message);
    if (message.toLowerCase().includes('allow')) {
      synthetic.name = 'NotAllowedError';
    } else if (message.toLowerCase().includes('found') || message.toLowerCase().includes('device')) {
      synthetic.name = 'NotFoundError';
    }
    logCameraError(synthetic, 'onMountError');
    const kind = cameraErrorKind(synthetic);
    if (kind === 'missing') {
      onMissingRef.current();
      onUnavailableRef.current?.();
      return;
    }
    onDeniedRef.current();
  }, []);

  return (
    <CameraView
      ref={cameraRef}
      style={{ flex: 1 }}
      facing={facing}
      mode={video ? 'video' : 'picture'}
      mute={false}
      onCameraReady={handleReady}
      onMountError={handleMountError}
    />
  );
}, (prev, next) => prev.facing === next.facing && prev.video === next.video && prev.cameraRef === next.cameraRef);

function RecordingRing({ recording, maxDuration }: { recording: boolean; maxDuration: number }) {
  const elapsed = useRecordingElapsed(recording, maxDuration);
  return <ShutterRing progress={recording ? elapsed / maxDuration : 0} />;
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
