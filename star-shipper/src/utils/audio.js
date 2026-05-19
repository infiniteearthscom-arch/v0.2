// ============================================
// AUDIO SERVICE
// --------------------------------------------
// Thin Howler.js wrapper. Game code calls playSound('event_id'); this
// module handles registry, lazy loading, and missing-file fallbacks
// (silent no-op so we can ship the scaffold before assets land).
//
// Volume + mute live in gameStore.audio so the top-bar toggle persists
// across sessions via Zustand's persist middleware. We pull state on
// each play() call rather than subscribing -- simpler, and the cost is
// negligible compared to the actual sound playback.
// ============================================

import { Howl } from 'howler';
import { useGameStore } from '@/stores/gameStore';

// One-shot event id -> file path (relative to public/). Filenames map
// directly to Kenney's free Sci-Fi Sounds pack so the pack files drop
// in unchanged. Missing files silently no-op so it's safe to add an
// event before the asset exists.
const SOUND_FILES = {
  weapon_fire:          '/sounds/laserSmall_000.ogg',
  weapon_hit:           '/sounds/impactMetal_000.ogg',
  ship_destroyed:       '/sounds/explosionCrunch_000.ogg',
  ship_destroyed_metal: '/sounds/impactMetal_000.ogg',
  dock_complete:        '/sounds/doorClose_000.ogg',
  button_click:         '/sounds/universfield-computer-mouse-click-02-383961.mp3',
};

// Looping ambient sounds -- separate from one-shots because they need
// loop:true on the Howl + manual start/stop tied to game state. Volumes
// are scaled down (LOOP_GAIN_MULT) so the constant background doesn't
// drown out one-shot SFX.
const LOOP_FILES = {
  fleet_engine: '/sounds/spaceEngine_000.ogg',
  system_music: '/sounds/placidplace-spaceship-ambience-with-effects-21420.mp3',
  // Continuous mining beam noise; started when the player locks a
  // mining target, stopped when the lock releases (range, depletion,
  // cargo full, manual cancel, system change).
  mining_laser: '/sounds/freesound_community-laser-weld-103309.mp3',
};
const LOOP_GAIN_MULT = 0.4;

// Cached Howl instances. Value is a Howl on success, null after a load
// error (so we don't retry on every play call), undefined before first use.
const cache = {};
const loopCache = {};
// Tracks which loops are currently playing (loopId -> Howl playId).
// Used so startLoop is idempotent and stopLoop knows what to stop.
const loopPlayingIds = {};

function getHowl(id) {
  if (cache[id] !== undefined) return cache[id];
  const src = SOUND_FILES[id];
  if (!src) { cache[id] = null; return null; }
  try {
    cache[id] = new Howl({
      src: [src],
      preload: true,
      // On load/play failure, DELETE the cache entry rather than null-
      // marking. Null would lock us out permanently; delete lets a
      // future startLoop call re-create the Howl (file may have been
      // added between the first failure and now, or browser autoplay
      // unlocked after first user interaction).
      onloaderror: () => { delete cache[id]; },
      onplayerror: () => { delete cache[id]; },
    });
  } catch {
    cache[id] = null;
  }
  return cache[id];
}

// Read current audio settings from the store. Falls back to safe
// defaults if the audio slice somehow isn't present yet (e.g. during
// initial hydration).
function getAudioSettings() {
  const a = useGameStore.getState().audio || {};
  return {
    muted:        a.muted ?? false,
    masterVolume: a.masterVolume ?? 0.8,
    sfxVolume:    a.sfxVolume ?? 1.0,
  };
}

// Play a registered sound by event id. Safe to call from anywhere; will
// silently no-op if muted, missing, or volume is zero.
export function playSound(id) {
  const { muted, masterVolume, sfxVolume } = getAudioSettings();
  if (muted) return;
  const gain = masterVolume * sfxVolume;
  if (gain <= 0) return;
  const howl = getHowl(id);
  if (!howl) return;
  try {
    howl.volume(gain);
    howl.play();
  } catch {
    // Browsers throttle / reject under various conditions (no user
    // interaction yet, too many concurrent sounds). Silent no-op.
  }
}

// ============================================
// LOOPS
// ============================================
// Long-running ambient sounds. Call startLoop on mount / state-enter,
// stopLoop on unmount / state-exit. Idempotent -- calling startLoop
// twice is safe (won't double-play).

function getLoopHowl(id) {
  if (loopCache[id] !== undefined) return loopCache[id];
  const src = LOOP_FILES[id];
  if (!src) { loopCache[id] = null; return null; }
  try {
    loopCache[id] = new Howl({
      src: [src],
      loop: true,
      preload: true,
      // Delete (not null) so future startLoop calls can retry. Critical
      // for loops, since they're only kicked off by mount / mute-toggle;
      // without retry, a single load failure means no music for the
      // entire session.
      onloaderror: () => { delete loopCache[id]; delete loopPlayingIds[id]; },
      onplayerror: () => { delete loopCache[id]; delete loopPlayingIds[id]; },
    });
  } catch {
    loopCache[id] = null;
  }
  return loopCache[id];
}

export function startLoop(id) {
  const { muted, masterVolume, sfxVolume } = getAudioSettings();
  if (muted) return;
  const gain = masterVolume * sfxVolume * LOOP_GAIN_MULT;
  if (gain <= 0) return;
  const howl = getLoopHowl(id);
  if (!howl) return;
  if (loopPlayingIds[id] != null) return; // already playing
  try {
    howl.volume(gain);
    loopPlayingIds[id] = howl.play();
  } catch {
    // Same browser throttling caveats as one-shots.
  }
}

export function stopLoop(id) {
  const howl = loopCache[id];
  const playId = loopPlayingIds[id];
  if (!howl || playId == null) return;
  try {
    howl.stop(playId);
  } catch {}
  delete loopPlayingIds[id];
}
