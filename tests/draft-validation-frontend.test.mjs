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
  assert.match(routeConfiguratorSource, /^import React, \{ useState \} from ["']react["'];/);
  assert.match(routeEntrySource, /^import React from ["']react["'];/);
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
