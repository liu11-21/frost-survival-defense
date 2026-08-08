import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 180_000,
  reporter: [["line"]],
  use: {
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    headless: true,
    // Use the signed system Chrome on this managed Windows workstation when
    // Playwright's bundled browser is unavailable. Linux CI leaves this unset
    // and installs the pinned Chromium artifact in the workflow.
    channel: process.platform === "win32" ? "chrome" : undefined,
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
});
