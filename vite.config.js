import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const legacyAssets = [
  "_headers",
  "_redirects",
  "contract-reference.js",
  "npl-data-analysis-engine.js",
  "npl-secret-module.js",
  "GlobalFleetGlobe.js",
  "assets/css/density-globe.css",
  "contextual-feedback.js",
  "session-draft.js",
  "wpi.csv",
  "Ancla Load.svg",
  "Ancla Discharge.svg",
];

function copyLegacyAssets() {
  return {
    name: "copy-legacy-assets",
    closeBundle() {
      const root = process.cwd();
      const dist = resolve(root, "dist");

      const publicSource = resolve(root, "public");
      const publicTarget = resolve(dist, "public");
      if (existsSync(publicSource)) {
        cpSync(publicSource, publicTarget, { recursive: true });
      }

      for (const asset of legacyAssets) {
        const source = resolve(root, asset);
        if (!existsSync(source)) {
          continue;
        }

        const target = resolve(dist, asset);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
    },
  };
}

export default defineConfig({
  plugins: [copyLegacyAssets()],
  build: {
    assetsInlineLimit: 0,
    target: "es2022",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("jspdf") || id.includes("html2pdf") || id.includes("html2canvas") || id.includes("pdf-export-service")) {
            return "pdf-generators";
          }
          if (id.includes("npl-data-analysis-engine") || id.includes("npl-secret-module")) {
            return "risk-audit-engine";
          }
          if (id.includes("voyage-cost-engine") || id.includes("stress-test-engine") || id.includes("cbam-module") || id.includes("fcl-module")) {
            return "operational-calculators";
          }
          if (id.includes("GlobalFleetGlobe") || id.includes("map_loader")) {
            return "map-cartography";
          }
          if (id.includes("dual-trading-chartering-view") || id.includes("dual-mode-overlay") || id.includes("dataBridgeSyncService")) {
            return "dss-module";
          }
        },
      },
    },
  },
});
