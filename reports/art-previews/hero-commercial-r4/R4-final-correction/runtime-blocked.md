# Babylon runtime verification blocker

Status: **Static visual correction passed; Babylon runtime verification blocked**

本輪沒有製造合成 screenshot，也沒有用 Blender clay render 取代 Babylon runtime 證據。

## Attempts (maximum two)

1. `npm run dev -- --host 127.0.0.1 --port 5181`
2. `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5181`

兩次都在啟動階段停止，未建立 dev server，因此沒有開啟 `?heroReview=1`、沒有重新載入頁面，也沒有新增 runtime capture。

## Complete error

```text
failed to load config from D:\codex\遊戲開發\vite.config.ts
error when starting dev server:
Error: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:441:11)
    at ensureServiceIsRunning (D:\codex\遊戲開發\node_modules\esbuild\lib\main.js:1975:29)
    at build (D:\codex\遊戲開發\node_modules\esbuild\lib\main.js:1873:26)
    at bundleConfigFile (D:\codex\遊戲開發\node_modules\vite\dist\node\chunks\dep-BK3b2jBa.js:66845:24)
    at loadConfigFromFile (D:\codex\遊戲開發\node_modules\vite\dist\node\chunks\dep-BK3b2jBa.js:66815:27)
    at resolveConfig (D:\codex\遊戲開發\node_modules\vite\dist\node\chunks\dep-BK3b2jBa.js:66416:30)
    at createServer (D:\codex\遊戲開發\node_modules\vite\dist\node\chunks\dep-BK3b2jBa.js:63015:24)
```

這是受管控 Windows 環境禁止 Node 子程序建立的環境阻塞，不是 Hero GLB 載入錯誤。依本輪限制不下載未知執行檔、不停用安全機制，也不再無限制重試。

## Static evidence available

- `npm run art:validate:hero`：pass。
- GLB 仍包含 `HeroRoot`、`HeroSkeleton`、`weapon_socket.R`、`ranged_socket`、18 bones 與 7 animations。
- `reports/art-previews/hero-commercial-r4/R4-final-correction/`：三個 LOD 的 front／side／back／three-quarter clay renders。
- Babylon 的既有 `heroReview=1` captures 保留在 `reports/art-previews/hero-commercial/review/`，本輪不將它們誤標為本次幾何修正的 runtime proof。

Last stable correction commit before this verification checkpoint: `2f5b1f3`.
