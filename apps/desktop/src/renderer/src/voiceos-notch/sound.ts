/*
 * VoiceOS notch sounds - VERBATIM PORT.
 *
 * Source: VoiceOS 0.1.40 `out/renderer/assets/index-BKi3REhQ.js`
 * lines 246798-246860 (sound cache + `playSound`) and 246802-246824
 * (`reduceSoundGate`). The audio files are the exact shipped assets, copied
 * byte-for-byte out of the app (see `assets/`, hashes in `reference/MANIFEST.md`).
 *
 * The five sounds and where VoiceOS fires them:
 *   - toggleOn  / toggleOff : the notch opening / closing (recording start/stop)
 *   - alert                 : the "recording time limit" countdown warning
 *   - error                 : a failed turn
 *   - manusComplete         : a completed agent run
 *
 * Nothing here touches IPC or the network. It is a self-contained Web Audio
 * player plus the exact gate that decides when the open/close pair may fire.
 */

import alertSoundUrl from "./assets/alert.wav";
import manusCompleteSoundUrl from "./assets/manus-complete.wav";
import errorSoundUrl from "./assets/voiceos-error.mp3";
import toggleOffSoundUrl from "./assets/voiceos-off-v3.mp3";
import toggleOnSoundUrl from "./assets/voiceos-on-v3.mp3";

/** 246850 - every clone plays at this fixed volume. */
export const SOUND_VOLUME = 0.15;

export type SoundKey =
  | "toggleOn"
  | "toggleOff"
  | "error"
  | "alert"
  | "manusComplete";

/** The exact URL map from `preloadSounds` (246832-246838). */
const SOUND_URLS: Record<SoundKey, string> = {
  toggleOn: toggleOnSoundUrl,
  toggleOff: toggleOffSoundUrl,
  error: errorSoundUrl,
  alert: alertSoundUrl,
  manusComplete: manusCompleteSoundUrl
};

const soundCache = new Map<SoundKey, HTMLAudioElement>();
let preloaded = false;

/** preloadSounds() - 246831. Idempotent so it is safe to call on mount. */
export function preloadSounds(): void {
  if (preloaded) return;
  preloaded = true;
  (Object.entries(SOUND_URLS) as Array<[SoundKey, string]>).forEach(
    ([key, path]) => {
      const audio = new Audio(path);
      audio.preload = "auto";
      soundCache.set(key, audio);
    }
  );
}

/** playSound(soundKey) - 246845. Clones the cached element and plays at 0.15. */
export function playSound(soundKey: SoundKey): void {
  try {
    const audio = soundCache.get(soundKey);
    if (audio) {
      const clone = audio.cloneNode(true) as HTMLAudioElement;
      clone.volume = SOUND_VOLUME;
      clone.play().catch((err) => {
        console.warn(`[Sounds] Failed to play ${soundKey}:`, err);
      });
    } else {
      console.warn(`[Sounds] Sound not found in cache: ${soundKey}`);
    }
  } catch (err) {
    console.warn(`[Sounds] Error playing sound ${soundKey}:`, err);
  }
}

/* ------------------------------------------------------------------------- *
 * The open/close gate - 246798-246824.
 *
 * The notch does NOT play `toggleOn` the instant recording starts. It "arms"
 * on the recording-state edge, and only plays `on` when the microphone
 * actually delivers audio (`mic-audio`), then plays `off` when recording ends
 * if live audio had played. That is why a silent/misconfigured mic never
 * produces the chirp.
 * ------------------------------------------------------------------------- */

export interface SoundGateState {
  armed: boolean;
  livePlayed: boolean;
}

export const INITIAL_SOUND_GATE: SoundGateState = {
  armed: false,
  livePlayed: false
};

export interface RecordingStateSoundEvent {
  type: "recording-state";
  /** A different window owns the recording; the notch stays silent. */
  ownedElsewhere: boolean;
  isRecording: boolean;
  skipSound: boolean;
  soundEligible: boolean;
}

export type SoundGateEvent =
  | { type: "reset" }
  | { type: "mic-audio" }
  | RecordingStateSoundEvent;

export interface SoundGateResult {
  state: SoundGateState;
  play: SoundKey | null;
}

/** reduceSoundGate(state, event) - 246802. */
export function reduceSoundGate(
  state: SoundGateState,
  event: SoundGateEvent
): SoundGateResult {
  switch (event.type) {
    case "reset":
      return { state: INITIAL_SOUND_GATE, play: null };
    case "mic-audio":
      if (!state.armed) return { state, play: null };
      return { state: { armed: false, livePlayed: true }, play: "toggleOn" };
    case "recording-state": {
      if (event.ownedElsewhere) {
        return { state: INITIAL_SOUND_GATE, play: null };
      }
      if (event.isRecording) {
        if (event.skipSound) return { state, play: null };
        if (event.soundEligible) {
          return { state: { armed: true, livePlayed: false }, play: null };
        }
        return { state: INITIAL_SOUND_GATE, play: null };
      }
      const play =
        state.livePlayed && event.soundEligible && !event.skipSound
          ? "toggleOff"
          : null;
      return { state: INITIAL_SOUND_GATE, play };
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Recording time-limit warning - 263742-263800 + 263801-263833.
 * ------------------------------------------------------------------------- */

/** The warning fires `alert` when the 20-minute cap is one minute away. */
export const AGENT_RECORDING_TIME_LIMIT_WARNING_HEIGHT_PX = 32;

/** playRecordingTimeLimitAlert() - 267966. */
export function playRecordingTimeLimitAlert(): void {
  playSound("alert");
}
