import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  server: {
    host: true,
    port: 3001,
  },
  plugins: [crx({ manifest })],
});
