import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeConfiguratorSource = await readFile(
  new URL("../src/components/RouteConfigurator.tsx", import.meta.url),
  "utf8",
);
const routeEntrySource = await readFile(
  new URL("../src/route-configurator-entry.tsx", import.meta.url),
  "utf8",
);
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("draft validator TSX files import the React runtime explicitly", () => {
  assert.match(routeConfiguratorSource, /^import React, \{ useCallback, useEffect, useRef, useState \} from ["']react["'];/);
  assert.match(routeEntrySource, /^import React from ["']react["'];/);
});

test("route configurator render failures stay isolated behind a local ErrorBoundary", () => {
  assert.match(routeEntrySource, /class RouteConfiguratorErrorBoundary extends React\.Component/);
  assert.match(routeEntrySource, /static getDerivedStateFromError/);
  assert.match(routeEntrySource, /componentDidCatch\(error: Error\)/);
  assert.match(routeEntrySource, /El resto de Core PRO continúa disponible/);
  assert.match(routeEntrySource, /<RouteConfiguratorErrorBoundary>[\s\S]*<RouteConfigurator \/>/);
});

test("NGA validator follows reactive POL/POD state without a fixed port", () => {
  assert.match(routeConfiguratorSource, /SeaCharterStore\?\.subscribe/);
  assert.match(routeConfiguratorSource, /route:port-coordinates-updated/);
  assert.match(routeConfiguratorSource, /portIndexNo: selection\.portIndexNo/);
  assert.match(routeConfiguratorSource, /portName: selection\.portName/);
  assert.match(routeConfiguratorSource, /document\.getElementById\("current-draft"\)/);
  assert.match(routeConfiguratorSource, /actualDraft: selection\.actualDraft \|\| null/);
  assert.match(routeConfiguratorSource, /maxDraft: selection\.maxDraft \|\| null/);
  assert.doesNotMatch(routeConfiguratorSource, /45570|ALGER/i);
  assert.match(indexSource, /delete input\.dataset\.selectedPortIndexNo;/);
  assert.match(indexSource, /draftInput\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

test("NGA validation keeps a unified light corporate card in every state", () => {
  assert.match(routeConfiguratorSource, /border border-slate-200 bg-white shadow-/);
  assert.match(routeConfiguratorSource, /rounded-lg border bg-white px-4 py-3 text-slate-700/);
  assert.match(routeConfiguratorSource, /border-amber-200 bg-amber-50 text-amber-800/);
  assert.match(routeConfiguratorSource, /validationStatusLabel = isCleared \? "CALADO OK" : "OVERSIZED"/);
  assert.match(routeConfiguratorSource, /validation\.draftBasis === "ACTUAL" \? "Calado operativo calculado" : "Calado máximo \(fallback\)"/);
  assert.match(routeConfiguratorSource, /onClick=\{\(\) => void validateActivePort\(\)\}/);
  assert.doesNotMatch(routeConfiguratorSource, /bg-slate-9|bg-black|text-slate-100|text-slate-200/);
  assert.match(routeConfiguratorSource, /role="alert" className="rounded-lg border border-red-300 bg-red-50/);
});

test("Charter Party confirmation persists the required voyage fields and reports the result", () => {
  assert.match(routeConfiguratorSource, /fetch\("\/api\/v1\/charter-party", \{/);
  assert.match(routeConfiguratorSource, /contractRef:/);
  assert.match(routeConfiguratorSource, /imoNumber,/);
  assert.match(routeConfiguratorSource, /polName:/);
  assert.match(routeConfiguratorSource, /podName:/);
  assert.match(routeConfiguratorSource, /laydaysStartAt:/);
  assert.match(routeConfiguratorSource, /cancellingAt:/);
  assert.match(routeConfiguratorSource, /ballastDistanceNm:/);
  assert.match(routeConfiguratorSource, /const sanitizedPayload: CharterPartyPayload = \{/);
  assert.match(routeConfiguratorSource, /body: JSON\.stringify\(sanitizedPayload\)/);
  assert.doesNotMatch(routeConfiguratorSource, /vesselDwt:|vesselGt:|vesselFlag:|vesselYearBuilt:|mmsi:/);
  assert.doesNotMatch(routeConfiguratorSource, /draftValidationJson|JSON\.stringify\(validation\)/);
  assert.match(routeConfiguratorSource, /voyageStore\.getState\(\)\.clearDraft\(\)/);
  assert.match(routeConfiguratorSource, /Charter Party \$\{savedReference\} generado y guardado con éxito/);
  assert.match(routeConfiguratorSource, /No fue posible guardar el Charter Party/);
});

test("Data Bridge modal is exported globally and bound without inline handlers", () => {
  assert.match(indexSource, /export function openDataBridgeLinkModal\(\)/);
  assert.match(indexSource, /window\.openDataBridgeLinkModal = openDataBridgeLinkModal;/);
  assert.match(indexSource, /directLinkButton\?\.addEventListener\('click'/);
  assert.doesNotMatch(
    indexSource,
    /id="btn-open-databridge-direct"[^>]*onclick=/,
  );
});
