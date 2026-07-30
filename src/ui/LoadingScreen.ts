/**
 * The pre-boot overlay lives in index.html so it paints before any JavaScript
 * parses. These two helpers are the only code allowed to touch it.
 */

export function hideLoadingScreen(): void {
  const el = document.getElementById("loadingScreen");
  if (!el) return;
  el.classList.add("hidden");
  window.setTimeout(() => el.remove(), 900);
}

export function showFatalError(message: string): void {
  const screen = document.getElementById("loadingScreen");
  const hint = document.getElementById("loadingHint");
  if (screen) screen.classList.remove("hidden");
  if (hint) {
    hint.textContent = message;
    hint.classList.add("error");
  }
}
