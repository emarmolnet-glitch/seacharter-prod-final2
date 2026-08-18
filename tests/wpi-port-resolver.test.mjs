import assert from "node:assert/strict";
import test from "node:test";

import {
  loadWpiCatalog,
  resolveWpiPortFromCatalog,
  validateWpiVoyagePorts,
} from "../netlify/functions/_shared/wpi-port-resolver.mjs";

const catalog = await loadWpiCatalog();

test("loads the bundled World Port Index catalog", () => {
  assert.ok(catalog.length > 3_000);
  assert.ok(catalog.every((port) => port.source === undefined));
});

test("maps common port names to exact official WPI records", async () => {
  const validation = await validateWpiVoyagePorts("Bejaia", "Aveiro");

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.pol.match, {
    indexNo: 45550,
    regionNo: 45470,
    name: "BEJAIA",
    officialLabel: "BEJAIA (DZ)",
    countryCode: "DZ",
    latitude: 36.75,
    longitude: 5.083333,
    source: "WPI",
  });
  assert.equal(validation.pod.match.officialLabel, "AVEIRO (PT)");
  assert.equal(validation.pod.match.indexNo, 37970);
});

test("accepts a high-confidence typo without changing the WPI identity", () => {
  const resolution = resolveWpiPortFromCatalog("Bejaiaa", catalog);

  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.match.officialLabel, "BEJAIA (DZ)");
  assert.equal(resolution.match.source, "WPI");
});

test("requires clarification for duplicate port names", () => {
  const ambiguous = resolveWpiPortFromCatalog("Cartagena", catalog);
  const qualified = resolveWpiPortFromCatalog("Cartagena (ES)", catalog);

  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(
    ambiguous.suggestions.map((port) => port.officialLabel).sort(),
    ["CARTAGENA (CO)", "CARTAGENA (ES)"],
  );
  assert.equal(qualified.status, "resolved");
  assert.equal(qualified.match.officialLabel, "CARTAGENA (ES)");
});

test("returns a WPI clarification instead of inventing an unknown port", async () => {
  const validation = await validateWpiVoyagePorts("Xyzqwerty", "Aveiro");

  assert.equal(validation.valid, false);
  assert.equal(validation.pol.status, "not_found");
  assert.match(validation.clarification, /No encuentro el POL/);
  assert.match(validation.clarification, /índice mundial WPI/);
});
