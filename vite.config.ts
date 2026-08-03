import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

// Build marker regenerated on every build so a stale cached bundle is
// immediately obvious in-app (YYYYMMDD-HHmm, UTC).
const builtAtIso = new Date().toISOString();
const buildStamp = builtAtIso.replace(/[-:T]/g, "").slice(0, 12);
const buildId = `board-${buildStamp.slice(0, 8)}-${buildStamp.slice(8, 12)}`;

/** Emits `/build.json` alongside the bundle. The running app fetches it with
 *  `cache: no-store` and compares — that's how a phone holding a stale cached
 *  bundle finds out it's out of date. The bundle's own build id is baked in at
 *  compile time; build.json always reflects what's actually deployed. */
function buildManifestPlugin() {
  return {
    name: "creators13-build-manifest",
    generateBundle(this: any) {
      this.emitFile({
        type: "asset",
        fileName: "build.json",
        source: JSON.stringify({ buildId, builtAt: builtAtIso }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_BUILT_AT__: JSON.stringify(builtAtIso),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    buildManifestPlugin(),
    ViteImageOptimizer({
      png: { quality: 80 },
      jpeg: { quality: 80 },
      jpg: { quality: 80 },
      webp: { quality: 80 },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
