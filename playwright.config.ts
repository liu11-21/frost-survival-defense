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
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
});
