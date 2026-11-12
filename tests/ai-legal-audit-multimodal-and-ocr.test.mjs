import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [auditSource, ocrSource] = await Promise.all([
  readFile(new URL("../netlify/functions/ai-legal-audit.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/ocr-extract.ts", import.meta.url), "utf8"),
]);

test("ai-legal-audit preserves inlineData for multimodal Gemini requests", () => {
  assert.match(auditSource, /inlineData\?:\s*\{\s*mimeType:\s*string;\s*data:\s*string;\s*\}/);
  assert.match(auditSource, /extractInlineDataParts/);
  assert.match(auditSource, /const initialUserParts:\s*GeminiPart\[\]\s*=\s*\[\s*\{\s*text:\s*initialUserContent\s*\},\s*\.\.\.inlineDataParts,?\s*\]/);
  assert.match(auditSource, /const contentsHistory:\s*Array<\{\s*role:\s*"user"\s*\|\s*"model";\s*parts:\s*GeminiPart\[\]\s*\}>\s*=\s*\[\s*\{\s*role:\s*"user",\s*parts:\s*initialUserParts\s*\},?\s*\]/);
});

test("extractInlineDataParts extracts inlineData objects", () => {
  assert.match(auditSource, /export function extractInlineDataParts\(payload:\s*GeminiPayload\)/);
  assert.match(auditSource, /part\.inlineData\?\.mimeType && part\.inlineData\?\.data/);
  assert.match(auditSource, /mimeType:\s*String\(part\.inlineData\.mimeType\)/);
  assert.match(auditSource, /data:\s*String\(part\.inlineData\.data\)/);
});

test("ocr-extract serverless function is configured correctly", () => {
  assert.match(ocrSource, /path:\s*["']\/api\/ocr-extract["']/);
  assert.match(ocrSource, /gemini-2\.5-flash/);
  assert.match(ocrSource, /inlineData/);
  assert.match(ocrSource, /cleanBase64/);
});
