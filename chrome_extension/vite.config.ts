import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src_manifest.json";

export default defineConfig({
  server: {
    host: true,
    port: 3001,
  },
  plugins: [crx({ manifest })],
});
