# Known issues and boundaries

- The authored library is stylized procedural low-poly work and still needs human commercial-art direction for topology, PBR maps and bespoke acting.
- The runtime intentionally keeps procedural visual fallback; static validation does not prove every authored instance is visible in every gameplay state.
- The Vite bundle currently emits an existing large-chunk advisory.
- Blender source files are tracked for reproducibility; future edits to the listed source-media extensions use Git LFS. Existing local history is not rewritten during repository setup.
- Never commit .env, credentials, browser cookies, local captures or generated dist/.
