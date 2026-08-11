/**
 * Resolve a public asset path against the deployment's base URL.
 *
 * The manifest used to hold absolute paths like `/assets/models/characters/`.
 * That is correct when the game is served from the root, and wrong the moment
 * it is not: on GitHub Pages the site lives under `/frost-survival-defense/`,
 * so `/assets/...` resolves to `https://<user>.github.io/assets/...` and every
 * GLB, texture and atlas 404s. The page still boots, because a missing model
 * is a supported state that falls back to the procedural renderer -- so the
 * failure looks like "the art disappeared" rather than like a broken path.
 *
 * `import.meta.env.BASE_URL` is whatever `base` was at build time, so this is
 * a no-op locally (BASE_URL is `/` under `npm run dev`) and prefixes correctly
 * in a subpath deployment. Runtime behaviour is unchanged either way; only the
 * URL the loader asks for moves.
 *
 * Tests/integration checks may pass an explicit base path; production callers
 * normally omit it and use Vite's BASE_URL.
 */
export function withBase(path: string, basePath = import.meta.env.BASE_URL || "/"): string {
  const base = basePath || "/";
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
