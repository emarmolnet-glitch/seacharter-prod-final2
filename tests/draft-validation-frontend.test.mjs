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
  assert.doesNotMatch(routeConfiguratorSource, /45570|ALGER/i);
  assert.match(indexSource, /delete input\.dataset\.selectedPortIndexNo;/);
});

test("NGA validation keeps a unified light corporate card in every state", () => {
  assert.match(routeConfiguratorSource, /border border-slate-200 bg-white shadow-/);
  assert.match(routeConfiguratorSource, /rounded-lg border bg-white px-4 py-3 text-slate-700/);
  assert.match(routeConfiguratorSource, /border-amber-200 bg-amber-50 text-amber-800/);
  assert.match(routeConfiguratorSource, /validationStatusLabel = isCleared \? "CALADO OK" : "OVERSIZED"/);
  assert.match(routeConfiguratorSource, /onClick=\{\(\) => void validateActivePort\(\)\}/);
  assert.doesNotMatch(routeConfiguratorSource, /bg-slate-9|bg-black|text-slate-100|text-slate-200/);
  assert.doesNotMatch(routeConfiguratorSource, /border-red|bg-red|text-red|rose|salmon/i);
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
