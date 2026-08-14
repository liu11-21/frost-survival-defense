# Third-Party and Generated-Asset Provenance

This file records provenance needed before public redistribution. It is an inventory, not a substitute for the upstream license texts.

## MakeHuman / MPFB

The character-authoring pipeline uses MakeHuman/MPFB-derived human assets. Upstream MakeHuman Community documentation describes core assets and exported models as CC0. MPFB program source is separately licensed as GPL; this repository should not treat the software license and generated-asset license as the same thing.

Upstream project: `makehumancommunity/mpfb2`.

## Google Gemini / Lyria music

The BGM tracks under `public/assets/audio/music/` were generated with Google Gemini/Lyria according to the project owner. Keep the original generation provenance (account/product, approximate generation date, prompts/project notes where practical) outside the binary alone so future commercial/public-use review is auditable.

Current committed tracks include `menu-idle.mp3`, `preparation.mp3`, `combat.mp3`, `intense.mp3`, `warning.mp3`, and `wave-clear.mp3`.

Before the repository is made public, confirm the terms applicable to the exact Gemini product/account used and record any required attribution or redistribution limitation here.

## npm dependencies

JavaScript dependencies are declared in `package.json` / `package-lock.json`. Their upstream licenses remain their own and are not replaced by this project's eventual repository license.

## Contribution rule

Any future third-party model, texture, font, audio file, code sample, or dataset must add its source and redistribution license/provenance in the same pull request.
