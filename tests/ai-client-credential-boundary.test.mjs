import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frontendSource = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("AI reports keep credentials and inference behind Netlify Functions", () => {
  assert.doesNotMatch(frontendSource, /id=["']gemini-api-key["']/i);
  assert.doesNotMatch(frontendSource, /rodahmar_gemini_api_key/i);
  assert.doesNotMatch(frontendSource, /generativelanguage\.googleapis\.com/i);
  assert.doesNotMatch(frontendSource, /(?:localStorage|sessionStorage)[\s\S]{0,120}(?:gemini|google.*key)/i);
  assert.match(frontendSource, /fetch\('\/api\/ai-legal-audit'/);
  assert.match(frontendSource, /const rawBody = await response\.text\(\)/);
  assert.match(frontendSource, /JSON\.parse\(rawBody\)/);
  assert.match(frontendSource, /Error HTTP \$\{response\.status\}/);
});
