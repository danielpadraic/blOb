import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

/**
 * Whistle and bell cues for the Play timer.
 *
 * The hard requirement is that a cue never silences the user's music. Someone doing Tabata has
 * Spotify going; a timer that ducks or pauses it to blow a whistle is worse than a timer with no
 * whistle at all.
 *
 * On web that rules out `<audio>`. iOS Safari hands an HTMLMediaElement the system media session,
 * which pauses background playback and takes over Now Playing. Web Audio output is treated as
 * mixable instead, so a decoded AudioBuffer fired through an AudioContext plays over music
 * untouched. That is why this goes through `decodeAudioData` rather than the simpler element API.
 *
 * Cues are always best-effort. Every path is wrapped, and haptics fire whether or not sound does,
 * so a missing file, a locked audio context, or a muted switch still leaves a usable timer with an
 * on-screen countdown.
 *
 * TODO(native-audio): iOS and Android currently get haptics only — the repo has no audio module.
 * Adding `expo-audio` and calling `setAudioModeAsync({ interruptionMode: 'mixWithOthers',
 * playsInSilentMode: true })` before the first cue would light up `playNative` below without
 * touching any caller. Do not activate a session that interrupts other apps.
 */

export type LiftCue = 'whistle' | 'bell' | 'tick';

/** Loud enough to hear over a fan bike, quiet enough not to startle. */
const CUE_GAIN: Record<LiftCue, number> = {
  whistle: 0.55,
  bell: 0.5,
  tick: 0.28,
};

const SOURCES: Partial<Record<LiftCue, number>> = {
  whistle: require('@/assets/audio/whistle.wav'),
  bell: require('@/assets/audio/bell.wav'),
};

// -------------------------------------------------------------------------------------- mute flag

const MUTE_KEY = 'blob.lift.cues.muted';

let muted = readMuted();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Safari in a locked-down private window throws on access rather than returning null.
    return null;
  }
}

function readMuted(): boolean {
  return storage()?.getItem(MUTE_KEY) === '1';
}

export function cuesMuted(): boolean {
  return muted;
}

/**
 * Persists the choice so someone who lifts at 6am in a quiet gym is not re-muting every session.
 *
 * Native has no store here yet, so the flag holds for the life of the process. That is the same
 * gap as native playback and closes with it.
 */
export function setCuesMuted(next: boolean): void {
  muted = next;
  try {
    storage()?.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // A preference that cannot be written is not worth failing a workout over.
  }
}

// ------------------------------------------------------------------------------------- web audio

type WebAudioContext = AudioContext & { readonly state: AudioContextState };

let context: WebAudioContext | null = null;
let buffers: Partial<Record<LiftCue, AudioBuffer>> = {};
let loading: Promise<void> | null = null;

function audioContextClass(): typeof AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const scope = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

async function loadBuffers(ctx: WebAudioContext): Promise<void> {
  const entries = Object.entries(SOURCES) as [LiftCue, number][];
  await Promise.all(
    entries.map(async ([cue, mod]) => {
      try {
        const asset = Asset.fromModule(mod);
        await asset.downloadAsync();
        const uri = asset.uri ?? asset.localUri;
        if (!uri) {
          return;
        }
        const response = await fetch(uri);
        const bytes = await response.arrayBuffer();
        buffers[cue] = await ctx.decodeAudioData(bytes);
      } catch {
        // One cue failing to decode must not take the other down with it.
      }
    }),
  );
}

/**
 * Opens the audio context and decodes both cues.
 *
 * This has to run inside the tap that starts the timer. Safari will not let a page produce sound
 * until a user gesture has resumed a context, and the Play button is that gesture — which is also
 * why it is called from the press handler rather than from an effect on mount.
 */
export async function primeCues(): Promise<void> {
  const Ctor = audioContextClass();
  if (!Ctor) {
    return;
  }
  try {
    if (!context || context.state === 'closed') {
      context = new Ctor() as WebAudioContext;
      buffers = {};
      loading = null;
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
    if (!loading) {
      loading = loadBuffers(context);
    }
    await loading;
  } catch {
    // Play still runs on visuals and haptics.
  }
}

function playWeb(cue: LiftCue): void {
  const ctx = context;
  const buffer = ctx ? buffers[cue] : undefined;
  if (!ctx || !buffer || ctx.state !== 'running') {
    return;
  }
  try {
    // A fresh source and gain per cue so a bell landing on the tail of a whistle overlaps instead
    // of cutting it off. Nothing here touches media elements the page does not own.
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = CUE_GAIN[cue];
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // Already torn down.
      }
    };
    source.start();
  } catch {
    // Best effort.
  }
}

async function playNative(_cue: LiftCue): Promise<void> {
  // See TODO(native-audio) above. Haptics carry the cue until an audio module lands.
}

// ---------------------------------------------------------------------------------------- haptics

async function buzz(cue: LiftCue): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        // A whistle starting work is worth a firmer buzz than a tick counting down.
        navigator.vibrate(cue === 'tick' ? 12 : cue === 'bell' ? [30, 40, 30] : 45);
      }
      return;
    }
    const Haptics = await import('expo-haptics');
    if (cue === 'tick') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    await Haptics.notificationAsync(
      cue === 'bell'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
  } catch {
    // Haptics are optional everywhere.
  }
}

/**
 * Fires one cue.
 *
 * Haptics run even when muted — a mute is about not making noise in a quiet room, not about
 * giving up the signal. The on-screen countdown is unaffected either way.
 */
export function playCue(cue: LiftCue): void {
  void buzz(cue);
  if (muted) {
    return;
  }
  if (Platform.OS === 'web') {
    playWeb(cue);
    return;
  }
  void playNative(cue);
}

/** Lets the context go when Play closes so the tab is not holding an audio session open. */
export function releaseCues(): void {
  const ctx = context;
  context = null;
  buffers = {};
  loading = null;
  try {
    void ctx?.close();
  } catch {
    // Nothing to release.
  }
}
