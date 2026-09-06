import { Asset } from 'expo-asset';
import type { AudioPlayer } from 'expo-audio';
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
 * Native goes through `expo-audio` with the session opened `mixWithOthers`, which is the same
 * bargain by a different mechanism. That session does double duty: it also keeps the countdown
 * running once the screen locks, because iOS suspends an app that stops producing audio and a
 * frozen timer is a useless one. See `primeNative`.
 *
 * Cues are always best-effort. Every path is wrapped, and haptics fire whether or not sound does,
 * so a missing file, a locked audio context, or a muted switch still leaves a usable timer with an
 * on-screen countdown.
 */

export type LiftCue = 'whistle' | 'bell';

/** Loud enough to hear over a fan bike, quiet enough not to startle. */
const CUE_GAIN: Record<LiftCue, number> = {
  whistle: 0.55,
  bell: 0.5,
};

const SOURCES: Record<LiftCue, number> = {
  whistle: require('@/assets/audio/whistle.wav'),
  bell: require('@/assets/audio/bell.wav'),
};

/** One second of digital silence, looped. The reason a locked phone keeps counting down. */
const SILENCE: number = require('@/assets/audio/silence.wav');

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
 * Web storage only; on native the flag holds for the life of the process, which covers muting for
 * the duration of a workout but not across app launches.
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
  if (Platform.OS !== 'web') {
    // Once per Play. Re-entering would open a second session and a second silent loop.
    if (!nativeLoading) {
      nativeLoading = primeNative().catch(() => {
        // Haptics and the on-screen countdown still carry the timer.
      });
    }
    await nativeLoading;
    return;
  }

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

// ---------------------------------------------------------------------------------- native audio

let nativePlayers: Partial<Record<LiftCue, AudioPlayer>> = {};
/** The silent looping player that holds the audio session open. */
let keepAlive: AudioPlayer | null = null;
let nativeLoading: Promise<void> | null = null;

/**
 * Opens the native audio session and loads both cues.
 *
 * Two things are load-bearing here.
 *
 * `interruptionMode: 'mixWithOthers'` is what lets a whistle land on top of Spotify instead of
 * stopping it. Requesting exclusive focus, or ducking, would be a worse timer than a silent one —
 * nobody wants their music killed eight times in four minutes.
 *
 * The silent looping player is what keeps the clock running when the screen goes off. iOS only
 * lets an app keep executing in the background while it is actually playing audio (that is what
 * the `audio` entry in UIBackgroundModes buys), so a timer that goes quiet between rounds gets
 * suspended and stops counting. Holding a silent loop open for the life of the timer keeps the
 * session — and the JavaScript interval — alive through a lock. It plays nothing audible and, being
 * mixed rather than exclusive, never takes the audio route from the music over the top of it.
 *
 * Android grants this for roughly three minutes and then reclaims it, because sustained background
 * playback there wants lock screen controls, which in turn require exclusive focus. Trading the
 * user's music for a longer background window is the wrong trade, so the wake lock carries it
 * instead and the wall-clock catch-up in the overlay covers whatever is lost.
 */
async function primeNative(): Promise<void> {
  const mod = await import('expo-audio');

  await mod.setAudioModeAsync({
    // A gym phone is usually on silent, and a cue nobody can hear is not a cue.
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'mixWithOthers',
  });

  const cues = Object.keys(SOURCES) as LiftCue[];
  for (const cue of cues) {
    try {
      const player = mod.createAudioPlayer(SOURCES[cue]);
      player.volume = CUE_GAIN[cue];
      nativePlayers[cue] = player;
    } catch {
      // One cue failing to load must not take the other down with it.
    }
  }

  try {
    keepAlive = mod.createAudioPlayer(SILENCE);
    keepAlive.loop = true;
    // The file is silent, so this is inaudible either way. Left just above zero rather than at it,
    // so there is no question the player counts as playing.
    keepAlive.volume = 0.01;
    keepAlive.play();
  } catch {
    // Without it the timer still runs on screen and under the wake lock; it just will not survive
    // a lock on iOS.
    keepAlive = null;
  }
}

function playNative(cue: LiftCue): void {
  const player = nativePlayers[cue];
  if (!player) {
    return;
  }
  void (async () => {
    try {
      // Cues repeat, and a finished player sits at the end of its buffer, so rewind before every
      // hit or the second whistle is silence.
      await player.seekTo(0);
    } catch {
      // Seeking is a nicety; playing is the point.
    }
    try {
      player.play();
    } catch {
      // Best effort.
    }
  })();
}

function releaseNative(): void {
  const players = Object.values(nativePlayers);
  const alive = keepAlive;
  nativePlayers = {};
  keepAlive = null;
  nativeLoading = null;
  try {
    alive?.pause();
    alive?.remove();
  } catch {
    // Already torn down.
  }
  for (const player of players) {
    try {
      player?.remove();
    } catch {
      // Already torn down.
    }
  }
}

// ---------------------------------------------------------------------------------------- haptics

/**
 * How hard a buzz should land.
 *
 * `work` starts an effort block, `recovery` starts a rest, and `end` marks the last round. Sound
 * and vibration are deliberately separate: the timer buzzes exactly once per round change, so
 * pairing a haptic with every sound as well would double up at an ON-to-OFF handover, where a
 * bell and a transition land in the same instant.
 */
export type LiftBuzz = 'work' | 'recovery' | 'end';

const WEB_PATTERN: Record<LiftBuzz, number | number[]> = {
  work: 45,
  recovery: 18,
  end: [30, 40, 30],
};

/**
 * Vibrates for a round change.
 *
 * This ignores the mute toggle. Mute is about not making noise in a quiet gym, not about giving
 * up the signal — and a buzz is the only cue that still reaches someone whose phone is face down
 * on the floor.
 */
export function buzz(kind: LiftBuzz): void {
  void (async () => {
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(WEB_PATTERN[kind]);
        }
        return;
      }
      const Haptics = await import('expo-haptics');
      if (kind === 'recovery') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }
      await Haptics.notificationAsync(
        kind === 'end'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch {
      // Haptics are optional everywhere.
    }
  })();
}

/** Plays one cue's sound. Silent when muted; the buzz carries the signal instead. */
export function playCue(cue: LiftCue): void {
  if (muted) {
    return;
  }
  if (Platform.OS === 'web') {
    playWeb(cue);
    return;
  }
  playNative(cue);
}

/**
 * Lets the audio session go when Play closes.
 *
 * On native this is what stops the silent keep-alive. Leaving it running would hold a background
 * audio assertion — and the battery drain that comes with it — long after the workout ended.
 */
export function releaseCues(): void {
  if (Platform.OS !== 'web') {
    releaseNative();
    return;
  }
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
