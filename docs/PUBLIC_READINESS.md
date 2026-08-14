# Public Readiness Gate

This repository is being prepared for public visibility. Public visibility is **not** the same thing as a completed licensing/security review.

## Gate status

- [x] Current-tree credential pattern search: no obvious PAT/API/private-key patterns found by repository code search.
- [x] Local-secret defaults: `.env` and local MCP/editor state are ignored; `.env.example` contains no credential values.
- [x] Public contribution/security documents and templates prepared.
- [x] GitHub Actions public-fork review: no `pull_request_target` trigger found; Pages uses scoped permissions.
- [ ] Full Git-history secret scan completed outside GitHub code search.
- [ ] Commit-author privacy reviewed. Existing history contains a real author email and must be accepted or rewritten before publication.
- [ ] Repository history/size strategy completed. GitHub currently reports a repository size around 1.35 GB; deleting current files alone will not remove old blobs from history.
- [ ] Repository-wide license split selected and committed.
- [ ] Music/audio provenance and redistribution terms documented.
- [ ] All non-project third-party asset provenance documented.
- [ ] `main` branch protection/ruleset enabled (PR required, no force push, no deletion).
- [ ] Default GitHub Actions token permissions set to read-only unless a workflow explicitly needs more.
- [ ] Private vulnerability reporting / security settings enabled when available.
- [ ] Visibility changed from Private to Public only after every blocking item above is resolved.

## Preliminary provenance findings

The character pipeline uses MakeHuman/MPFB-derived assets. MakeHuman Community documents core assets/exports under CC0, while MPFB source code itself uses GPL. The project should document which generated assets are included and avoid copying MPFB program source into project code without respecting its software license.

The committed BGM files require a separate provenance record. They were generated with Google Gemini/Lyria according to the project owner; public redistribution and commercial-use expectations should be recorded against the terms applicable to the account/product used when the tracks were generated.

## Repository hygiene policy

Keep production source, runtime assets, tests, and curated acceptance evidence. Do not commit transient deformation dumps, CI output, temporary screenshots, local Blender/MCP state, or repeated WIP captures. Large editable source media follows `.gitattributes` Git LFS rules.

History rewriting is intentionally not performed by this public-readiness branch. If required for privacy, secrets, or repository-size reduction, it must be done as a dedicated migration with a backup and explicit owner approval because commit SHAs and open branches/PRs can be invalidated.
