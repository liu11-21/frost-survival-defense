# Known issues and boundaries

- **Warrior-W2 is mid-flight; see `WARRIOR_W2_STATUS.md` before touching Warrior.** Asset ownership moved from Codex to Claude Code on 2026-08-04 by user instruction, and `scripts/blender/build_warrior.py` was rewritten rather than patched.
- Skill-cast VFX (`src/effects/`, `src/hero/HeroSkills.ts`) was requested but is **not started**.
- The authored library is stylized procedural low-poly work and still needs human commercial-art direction for topology, PBR maps and bespoke acting. This is a ceiling of the generate-from-Python pipeline, not a tuning gap: closing it requires authored/sculpted geometry.
- The runtime intentionally keeps procedural visual fallback; static validation does not prove every authored instance is visible in every gameplay state.
- The Vite bundle currently emits an existing large-chunk advisory.
- Blender source files are tracked for reproducibility; future edits to the listed source-media extensions use Git LFS. Existing local history is not rewritten during repository setup.
- Never commit .env, credentials, browser cookies, local captures or generated dist/.
