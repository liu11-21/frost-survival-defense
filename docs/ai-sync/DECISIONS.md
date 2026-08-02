# Decisions

- Keep Babylon procedural visuals as a fail-safe while authored GLBs are validated independently.
- Preserve existing Git history; repository setup must not rewrite or force-push it.
- Keep the GitHub repository private and never store secrets in source control.
- Use Git LFS for future changes to editable source-media extensions without forcing a history rewrite during initial synchronization.
