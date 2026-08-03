# R4-D runtime verification boundary

No Babylon runtime capture is being reported as passed for R4-D.

The attempted local Vite server command was:

`npm run dev -- --host 127.0.0.1 --port 5181`

It failed before serving the scene because Vite/esbuild could not spawn its
child process:

`Error: spawn EPERM`

The same managed-process restriction stops `npm run build` while Vite loads
`vite.config.ts`. Therefore no new `heroReview=1` screenshot or runtime LOD
switching claim is fabricated. Re-run R4-D runtime capture after the Windows
environment permits the signed Node/esbuild child process; the static GLB
and Babylon LOD-name integration changes are already present in this commit.
