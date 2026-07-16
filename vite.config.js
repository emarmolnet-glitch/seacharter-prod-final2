import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const legacyAssets = [
  "_headers",
  "_redirects",
  "npl-data-analysis-engine.js",
  "npl-secret-module.js",
  "GlobalFleetGlobe.js",
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
});
