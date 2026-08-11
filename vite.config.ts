import { defineConfig } from "vite";

export default defineConfig({
  // Relative by default, so `npm run dev` and `npm run preview` behave exactly
  // as before. CI sets VITE_BASE=/frost-survival-defense/ for GitHub Pages,
  // which makes import.meta.env.BASE_URL absolute and lets every asset URL
  // resolve under the project subpath.
  base: process.env.VITE_BASE ?? "./",
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    chunkSizeWarningLimit: 4096,
  },
});
