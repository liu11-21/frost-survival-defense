# Gameplay SFX V1 Asset / License Manifest

## Status

**COMMERCIAL READY: NO**

Gameplay SFX V1 intentionally uses temporary procedural Web Audio synthesis so the runtime, gameplay timing, mixing, variation, concurrency and positional-audio behavior can be validated before final commercial sound assets are selected.

## Source and license status

| SFX group | V1 source | Variations | External file | License status | Production status |
| --- | --- | ---: | --- | --- | --- |
| Hero melee swing | `src/effects/AudioManager.ts` procedural synthesis | 3 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Hero melee hit | `src/effects/AudioManager.ts` procedural synthesis | 3 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Hero ranged shot | `src/effects/AudioManager.ts` procedural synthesis | 3 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Enemy hit | `src/effects/AudioManager.ts` procedural synthesis | 4 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Enemy death | `src/effects/AudioManager.ts` procedural synthesis | 4 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Squad melee | `src/effects/AudioManager.ts` procedural synthesis | 3 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Squad gunshot | `src/effects/AudioManager.ts` procedural synthesis | 3 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Magic attack | `src/effects/AudioManager.ts` procedural synthesis | 3 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Artillery explosion | `src/effects/AudioManager.ts` procedural synthesis | 3 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Build / place | `src/effects/AudioManager.ts` procedural synthesis | 2 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Build completion accent | `src/effects/AudioManager.ts` layered clunk + confirmation synthesis | 2 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Boss slam accent | `src/effects/AudioManager.ts` layered impact + sub synthesis | 2 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Hero skill accents | `src/effects/AudioManager.ts` frost / barrage / rally synthesis | 2 each | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| UI confirm / error | `src/effects/AudioManager.ts` procedural synthesis | 1 + 1 | No | Project-authored runtime synthesis; no third-party sample | TEMP |
| Furnace ambience / cold wind | `src/effects/AudioManager.ts` oscillator + generated noise loops | 2 loops | No | Project-authored runtime synthesis; no third-party sample | TEMP |

No third-party SFX binary assets are introduced by Gameplay SFX V1. The generated noise buffer and oscillator tones are created at runtime and are not downloaded media.

## Voice architecture

A dedicated Voice bus is reserved in the SFX graph, but Gameplay SFX V1 contains no character voice-bark recordings and no voice asset licensing claims.

## BGM boundary

Existing BGM MP3 files are outside the scope of this SFX manifest. This document does not make or change any commercial-license claim about those music files.

## Commercialization gate

Before `COMMERCIAL READY` can become `YES`, final SFX sound design and any replacement sample assets must receive an explicit commercial-license/provenance review. Runtime implementation or successful playback alone is not commercial clearance.
