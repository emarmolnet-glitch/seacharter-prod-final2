import assert from "node:assert/strict";
import test from "node:test";

import { toIsoAlpha2Flag } from "../db/flag-country-codes.mjs";

test("maritime flag countries map to ISO 3166-1 alpha-2", () => {
  assert.equal(toIsoAlpha2Flag("Barbados"), "BB");
  assert.equal(toIsoAlpha2Flag("Panama"), "PA");
  assert.equal(toIsoAlpha2Flag("Liberia"), "LR");
  assert.equal(toIsoAlpha2Flag("Marshall Islands"), "MH");
  assert.equal(toIsoAlpha2Flag("Türkiye"), "TR");
  assert.equal(toIsoAlpha2Flag("Hong Kong, China"), "HK");
});

test("existing known alpha-2 codes are preserved", () => {
  assert.equal(toIsoAlpha2Flag("bb"), "BB");
  assert.equal(toIsoAlpha2Flag(" PA "), "PA");
});

test("unknown or empty flags return null", () => {
  assert.equal(toIsoAlpha2Flag("Atlantis"), null);
  assert.equal(toIsoAlpha2Flag("Unknown"), null);
  assert.equal(toIsoAlpha2Flag(null), null);
  assert.equal(toIsoAlpha2Flag(undefined), null);
});
