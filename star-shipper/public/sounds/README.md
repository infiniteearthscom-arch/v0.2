# Sound Effects

Drop audio files in this directory matching the filenames the audio service expects. Missing files silently no-op — the game still runs without them.

## Required filenames

These match Kenney's free Sci-Fi Sounds pack (https://kenney.nl/assets/sci-fi-sounds) so you can drop the pack files in unchanged. Source-of-truth list lives in `star-shipper/src/utils/audio.js` → `SOUND_FILES`.

| File | Triggered when |
|---|---|
| `laserSmall_000.ogg`     | Any fleet weapon fires |
| `impactMetal_000.ogg`    | A player projectile hits an enemy |
| `explosionCrunch_000.ogg`| An enemy hull reaches 0 |
| `doorClose_000.ogg`      | Ship transitions to docked at any body |
| `impactMetal_000.ogg`    | Toolbar button is clicked |
| `spaceEngine_000.ogg`    | **Loop:** plays while in system view + not docked (fleet engine ambient) |

To swap a sound for a different one (e.g. `laserLarge_000.ogg` for the fire sound), edit the path in `audio.js` — no other code changes needed.

## Adding new events

1. Add the event to `SOUND_FILES` in `star-shipper/src/utils/audio.js`.
2. Drop the matching audio file here.
3. Call `playSound('your_event_id')` from anywhere in the client.

## Where to source sounds

- **freesound.org** — Creative Commons; broad library, varying quality.
- **Kenney game assets** (https://kenney.nl/assets) — public domain SFX packs aimed at game developers. "Sci-Fi Sounds" and "Interface Sounds" are direct hits for this project.
- **ElevenLabs Sound Effects** (https://elevenlabs.io/sound-effects) — generate sounds from text prompts. Useful for one-off custom sounds.

## File format / size

- Format: `.mp3` is the safe default (universal browser support). `.ogg` works too — just adjust `SOUND_FILES` paths.
- Size: keep individual SFX under ~50 KB. They preload eagerly, so a heavy library bloats first-load.
- Length: most game SFX should be 0.1–1.5 seconds. Longer ambient loops are a different category — don't pile them in here without thought.

## Testing without files

The audio service treats missing files as silent no-ops. You can ship the audio scaffold without any `.mp3`s — the game runs normally, just silent. Drop files in and they activate immediately on next page load.
