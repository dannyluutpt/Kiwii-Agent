import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  worker: { format: "es" },
  server: {
    port: 5173,
    // The Worker runs on 8787 under `wrangler dev`; same-origin in production so no CORS.
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { target: "esnext", outDir: "dist" },
})
