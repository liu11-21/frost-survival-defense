import { Game } from "./game/Game";
import { showFatalError } from "./ui/LoadingScreen";
import { installMainMenuV2 } from "./ui/MainMenuV2";
import "./styles.css";
import "./ui.css";
import "./ui-hud.css";
import "./ui-scene-rework.css";
import "./main-menu-v2.css";
import "./main-menu-v2-tuning.css";

/** Entry point: find the canvas, start the game, report fatal failures visibly. */
async function bootstrap(): Promise<void> {
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

  // Presentation-only adapter: GameMenus keeps ownership of routing and the
  // Babylon scene remains the live background. Install before async startup so
  // the first main-menu render is upgraded instead of flashing the old layout.
  installMainMenuV2();
  game.start().catch(showFatal);

  const params = new URLSearchParams(window.location.search);
  const heroReview = params.get("heroReview") === "1";
  const heroGameplayReview = params.get("heroGameplayReview") === "1";
  // Isolated candidate review. Returns before the game is constructed, so the
  // production Hero path is untouched and nothing about gameplay is loaded.
  if (params.get("humanCandidateReview") === "1") {
    const canvas = document.getElementById("renderCanvas");
    if (canvas instanceof HTMLCanvasElement) {
      // The boot splash is removed by the game, and this path returns before
      // the game exists -- so without this the overlay sits over the canvas
      // and every screenshot is of a loading screen.
      document.getElementById("loadingScreen")?.remove();
      // index.html ships the HUD markup statically; the game normally owns it.
      // This path never constructs the game, so the HUD would otherwise sit
      // over every review frame.
      for (const el of Array.from(document.body.children)) {
        if (el !== canvas && !el.contains(canvas)) (el as HTMLElement).style.display = "none";
      }
      const { startHumanCandidateReview } = await import("./character/HumanCandidateReview");
      startHumanCandidateReview(canvas);
      document.body.classList.add("human-candidate-review");
      return;
    }
  }
  const warriorReview = params.get("unitReview") === "warrior";
  const uiVerification = params.get("uiVerification") === "1";
  if (import.meta.env.DEV || heroReview || heroGameplayReview || warriorReview || uiVerification) {
    const instance = game;
    window.frostbound = {
      game: instance,
      step: (dt: number, frames = 1, render = true) => {
        for (let i = 0; i < frames; i++) instance.stepManually(dt, render);
      },
      snapshot: () => instance.debugSnapshot(),
      stopLoop: () => instance.stopLoop(),
      renderReviewFrame: () => instance.renderReviewFrame(),
      api: () => instance.debugApi(),
    };
  }

  window.addEventListener("beforeunload", () => game.dispose());
}

function showFatal(error: unknown): void {
  console.error("[frostbound] fatal", error);
  showFatalError("無法啟動：此瀏覽器可能不支援 WebGL。請使用最新版 Chrome、Edge 或 Firefox。");
}

void bootstrap();
