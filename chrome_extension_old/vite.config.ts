import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src_manifest.json";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    host: true,
    port: 3001,
  },
  plugins: [
    tsconfigPaths(),
    crx({ manifest }),
    react({
      jsxImportSource: "@emotion/react",
      babel: {
        plugins: ["@emotion/babel-plugin"],
      },
    }),]
});