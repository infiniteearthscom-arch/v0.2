# Sound Effects

Drop `.mp3` files in this directory matching the filenames the audio service expects. Missing files silently no-op — the game still runs without them.

## Required filenames

These are the events wired into the game today (`star-shipper/src/utils/audio.js` → `SOUND_FILES`):

| File | Triggered when |
|---|---|
| `weapon_fire.mp3` | Any fleet weapon fires |
| `weapon_hit.mp3` | A player projectile hits an enemy |
| `ship_destroyed.mp3` | An enemy hull reaches 0 |
| `dock_complete.mp3` | Ship transitions to docked at any body |
| `button_click.mp3` | Toolbar button is clicked |

## Adding new events

1. Add the event to `SOUND_FILES` in `star-shipper/src/utils/audio.js`.
2. Drop the matching `.mp3` here.
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
