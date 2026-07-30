import { Game } from "./game/Game";
import { showFatalError } from "./ui/LoadingScreen";
import "./styles.css";
import "./ui.css";
import "./ui-hud.css";

/** Entry point: find the canvas, start the game, report fatal failures visibly. */
function bootstrap(): void {
  const canvas = document.getElementById("renderCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("renderCanvas element is missing from index.html");
  }

  let game: Game;
  try {
    game = new Game(canvas);
  } catch (error) {
    showFatal(error);
    return;
  }

  game.start().catch(showFatal);

  if (import.meta.env.DEV) {
    const instance = game;
    window.frostbound = {
      game: instance,
      step: (dt: number, frames = 1, render = true) => {
        for (let i = 0; i < frames; i++) instance.stepManually(dt, render);
      },
      snapshot: () => instance.debugSnapshot(),
      stopLoop: () => instance.stopLoop(),
      api: () => instance.debugApi(),
    };
  }

  window.addEventListener("beforeunload", () => game.dispose());
}

function showFatal(error: unknown): void {
  console.error("[frostbound] fatal", error);
  showFatalError("無法啟動：此瀏覽器可能不支援 WebGL。請使用最新版 Chrome、Edge 或 Firefox。");
}

bootstrap();
