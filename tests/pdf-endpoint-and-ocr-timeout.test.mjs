import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [tomlSource, indexSource, pdfSource] = await Promise.all([
  readFile(new URL("../netlify.toml", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/pdf.ts", import.meta.url), "utf8"),
]);

test("netlify.toml configures redirects for pdf and ocr-extract", () => {
  assert.match(tomlSource, /from\s*=\s*["']\/api\/pdf["'][\s\S]*?to\s*=\s*["']\/\.netlify\/functions\/pdf["']/);
  assert.match(tomlSource, /from\s*=\s*["']\/api\/ocr-extract["'][\s\S]*?to\s*=\s*["']\/\.netlify\/functions\/ocr-extract["']/);
});

test("netlify/functions/pdf.ts implements /api/pdf with success response and blobs persistence", async () => {
  assert.match(pdfSource, /path:\s*["']\/api\/pdf["']/);
  assert.match(pdfSource, /success:\s*true/);
  assert.match(pdfSource, /getStore/);
  assert.match(pdfSource, /req\.method\s*===\s*["']POST["']/);
  assert.match(pdfSource, /req\.method\s*===\s*["']GET["']/);
});

test("index.html wraps response.json() in try/catch within savePDFToServer to prevent HTML parse crashes", () => {
  const savePdfSnippet = indexSource.substring(
    indexSource.indexOf("async function savePDFToServer"),
    indexSource.indexOf("async function downloadPDFFromServer")
  );
  assert.match(savePdfSnippet, /fetch\(`\/api\/pdf\?reference=/);
  assert.match(savePdfSnippet, /try\s*\{\s*result\s*=\s*await\s+response\.json\(\);?\s*\}\s*catch/);
});

test("index.html implements image and PDF optimizations prior to calling /api/ocr-extract without const reassignments", () => {
  assert.match(indexSource, /extractFirstPagesFromPdf/);
  assert.match(indexSource, /compressImageForOcr/);
  assert.match(indexSource, /const trimmedBase64 = await extractFirstPagesFromPdf\(file,\s*5\)/);
  assert.match(indexSource, /let uploadedBase64\s*=\s*base64Data;/);
});
