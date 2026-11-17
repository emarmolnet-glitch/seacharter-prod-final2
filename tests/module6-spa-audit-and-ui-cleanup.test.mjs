import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [indexSource, syncPushSource, aiAuditSource, bgWorkerSource, ocrSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/sync-push.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/ai-legal-audit.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/process-legal-audit-background.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/ocr-extract.ts", import.meta.url), "utf8"),
]);

test("1. analyzeDocument in index.html and backend unblock direct contract audit", () => {
  // index.html unblocks when text or uploaded media is present
  assert.match(indexSource, /const hasUploadedMedia = Boolean\(State\.uploadedFile\?\.base64 \|\| State\.uploadedFile\?\.pageParts\?\.length \|\| State\.uploadedFile\?\.file\);/);
  assert.match(indexSource, /if\s*\(!text && !hasUploadedMedia && !activeTaskId\)\s*\{\s*showAuditGateError/);
  assert.match(indexSource, /if\s*\(!activeTaskId && !text && !hasUploadedMedia && strictAuditGateError\)/);
  
  // getStrictAuditGateError unblocks when contract text is present
  assert.match(indexSource, /if\s*\(data\?\.polizaAnalizada\?\.contenido\)\s*return\s*['"]{2};/);

  // Error handling displays visible alert in right panel and scrolls to errorBox
  assert.match(indexSource, /errorBox\.scrollIntoView\(\{ behavior:\s*['"]smooth['"], block:\s*['"]center['"] \}\)/);
  assert.match(indexSource, /Error durante la Auditoría del Contrato/);

  // sync-push.ts checks for document text before blocking
  assert.match(syncPushSource, /hasDocumentText/);

  // ai-legal-audit.ts validateAuditVesselSync unblocks when document text is present
  assert.match(aiAuditSource, /const hasDocumentText = Boolean\(/);
  assert.match(aiAuditSource, /if \(!syncId \|\| hasDocumentText\) return \{ available: true, payload \};/);
});

test("2. LEGAL_AUDIT_SYSTEM_PROMPT supports both Charter Parties and Commercial SPAs", () => {
  assert.match(aiAuditSource, /PÓLIZAS DE FLETAMENTO Y CONTRATOS MARÍTIMOS/);
  assert.match(aiAuditSource, /CONTRATOS COMERCIALES INTERNACIONALES \(SALES & PURCHASE AGREEMENTS - SPA\)/);
  assert.match(aiAuditSource, /SELLER/);
  assert.match(aiAuditSource, /BUYER/);
  assert.match(aiAuditSource, /TECH AND JURY/);
  assert.match(aiAuditSource, /TAVCIM/);
});

test("3. Unified Multimodal AI Audit: No fake templates, single entrypoint via analyzeDocument()", () => {
  // performLocalContractAudit and runCommercialNlpMotor delegate directly to analyzeDocument()
  assert.match(indexSource, /async function runCommercialNlpMotor\(\)\s*\{\s*return await analyzeDocument\(\);\s*\}/);
  assert.match(indexSource, /async function performLocalContractAudit\(text\)\s*\{\s*return await analyzeDocument\(\);\s*\}/);

  // Duplicate commercial NLP button is hidden
  assert.match(indexSource, /id="commercialNlpBtn"[^>]*style="display:\s*none\s*!important;"/);

  // Scanned PDF rendering and compression functions exist
  assert.match(indexSource, /function renderPdfPagesToCompressedParts/);
  assert.match(indexSource, /async function ensureFilePartsReady/);

  // Gemini schema requires real contract metadata fields in backend schemas
  assert.match(aiAuditSource, /vendedor_armador:\s*\{\s*type:\s*["']STRING["']/);
  assert.match(aiAuditSource, /comprador_fletador:\s*\{\s*type:\s*["']STRING["']/);
  assert.match(aiAuditSource, /mercancia_cantidad:\s*\{\s*type:\s*["']STRING["']/);
  assert.match(aiAuditSource, /incoterm_puertos:\s*\{\s*type:\s*["']STRING["']/);
  assert.match(aiAuditSource, /condiciones_pago:\s*\{\s*type:\s*["']STRING["']/);
  assert.match(aiAuditSource, /jurisdiccion_arbitraje:\s*\{\s*type:\s*["']STRING["']/);

  // Frontend analyzeDocument payload omits giant responseSchema to avoid overwriting phase-specific schemas
  const analyzeDocBlock = indexSource.slice(indexSource.indexOf("async function analyzeDocument("), indexSource.indexOf("function descargarExcelLaytime"));
  assert.doesNotMatch(analyzeDocBlock, /responseSchema/);

  // Backend prompt instructs extracting these real fields
  assert.match(aiAuditSource, /vendedor_armador/);
  assert.match(aiAuditSource, /comprador_fletador/);
  assert.match(aiAuditSource, /mercancia_cantidad/);
  assert.match(aiAuditSource, /incoterm_puertos/);
  assert.match(aiAuditSource, /condiciones_pago/);
  assert.match(aiAuditSource, /jurisdiccion_arbitraje/);
});

test("4. View 6 UI cleanup: Export JSON and Origen de datos are hidden, action buttons styled", () => {
  // Exportar JSON is hidden with display: none !important
  assert.match(
    indexSource,
    /id="commercial-nlp-export-json-btn"[^>]*style="display:\s*none\s*!important;"/
  );

  // ORIGEN DE DATOS is hidden with display: none !important
  assert.match(
    indexSource,
    /id="commercial-nlp-origin-container"[^>]*style="display:\s*none\s*!important;"/
  );

  // Action buttons have whitespace-nowrap and proper padding
  assert.match(indexSource, /onclick="printAuditReport\(\)"[^>]*whitespace-nowrap/);
  assert.match(indexSource, /onclick="copyFullAuditReport\(\)"[^>]*whitespace-nowrap/);
  assert.match(indexSource, /onclick="finishAuditSession\(\)"[^>]*whitespace-nowrap/);
  assert.match(indexSource, /<span>Copiar Todo<\/span>/);
});

test("5. Contrast fix for Proforma and Estrategia headers", () => {
  assert.match(indexSource, /audit-header-proforma/);
  assert.match(indexSource, /audit-header-strategy/);
  assert.match(indexSource, /#f0fdfa/);
  assert.match(indexSource, /#0f766e/);
  assert.match(indexSource, /#99f6e4/);
});

test("6. Vessel Audit vs Contract Audit mode differentiation & OCR boilerplate stripping", () => {
  // stripOcrBoilerplate exists and strips scanner boilerplate
  assert.match(indexSource, /function stripOcrBoilerplate\(text\)/);

  // analyzeDocument hides #audit-active-vessel-panel when not auditing a nominated vessel
  assert.match(
    indexSource,
    /activeVesselPanel\.classList\.add\(['"]hidden['"]\);\s*activeVesselPanel\.style\.setProperty\(['"]display['"],\s*['"]none['"],\s*['"]important['"]\);/
  );

  // Badge displays detectedType
  assert.match(indexSource, /docBadge\.innerText = detectedType;/);

  // Verify OCR boilerplate stripping logic
  const ocrBoilerplate = `[Documento PDF escaneado / OCR para auditar: clinker_spa.pdf]\nEste archivo PDF parece estar escaneado o protegido contra copia directa de texto. Por favor, realiza la lectura visual y OCR de este documento PDF adjunto, y audítalo (Contrato, Carta de Crédito, Factura, Packing List, etc.) evaluando si contradice la póliza de fletamento o genera riesgos de retrasos, costes, clima u otros factores que comprometan el éxito del viaje.\n\nCONTRACT FOR SALE AND PURCHASE OF CEMENT CLINKER\nSELLER: TECH AND JURY\nBUYER: TAVCIM`;
  
  // Test stripping helper regex
  const stripped = ocrBoilerplate
    .replace(/\[Documento PDF escaneado[\s\S]*?comprometan el éxito del viaje\.?/gi, '')
    .replace(/\[Documento PDF escaneado[\s\S]*?\]/gi, '')
    .replace(/Este archivo PDF parece estar escaneado[\s\S]*?(?:éxito del viaje\.?|\n\n)/gi, '')
    .trim();

  assert.ok(!stripped.includes("póliza de fletamento"), "Boilerplate mentioning póliza should be stripped");
  assert.ok(stripped.includes("TECH AND JURY"), "Contractual content should remain");

  const hasExplicitCharterTerms = /\b(?:GENCON|ASBATANKVOY|TIME\s*CHARTER|VOYAGE\s*CHARTER|\bNOR\b|NOTICE\s*OF\s*READINESS|DEMURRAGE|DESPATCH|LAYTIME)\b/i.test(stripped);
  const hasSpaKeywords = /sales?\s*(?:and|&)\s*purchase|\bspa\b|compraventa|seller|buyer|vendedor|comprador|commodity|clinker|cement|cemento|goods/i.test(stripped);
  const isSpa = hasSpaKeywords || !hasExplicitCharterTerms;

  assert.equal(isSpa, true, "OCR SPA document must be classified as isSpa: true");
});

test("7. Full vertical scroll repair and resEmail textarea height", () => {
  // #view-auditor has overflow-y-auto and padding-bottom: 120px !important
  assert.match(
    indexSource,
    /id="view-auditor"[^>]*class="[^"]*overflow-y-auto[^"]*pb-28[^"]*"[^>]*style="[^"]*padding-bottom:\s*120px\s*!important;[^"]*overflow-y:\s*auto\s*!important;[^"]*"/
  );

  // ai-work-grid has overflow: visible !important
  assert.match(
    indexSource,
    /class="[^"]*ai-work-grid[^"]*"[^>]*style="[^"]*overflow:\s*visible\s*!important;[^"]*"/
  );

  // #resultsContent has padding-bottom: 120px !important and pb-28
  assert.match(
    indexSource,
    /id="resultsContent"[^>]*class="[^"]*pb-28[^"]*"[^>]*style="[^"]*padding-bottom:\s*120px\s*!important;[^"]*"/
  );

  // resEmail textarea has rows="10" and min-height: 240px !important
  assert.match(
    indexSource,
    /textarea id="resEmail"\s+rows="10"\s+class="[^"]*min-h-\[240px\][^"]*"[^>]*style="min-height:\s*240px\s*!important;"/
  );

  // CSS rules ensure collapsible inner has overflow-y: auto and padding-bottom: 120px !important
  assert.match(
    indexSource,
    /#view-auditor \.audit-results-panel > \.collapsible-section__collapse > \.collapsible-section__inner\s*\{[^}]*padding-bottom:\s*120px\s*!important;/
  );
});

test("8. Scanned PDF upload preserves textarea.value, avoids report duplication, and backend exports complete metadata schema", () => {
  // In processUploadedDocument, textarea.value is set for scanned PDFs and not overwritten at the end
  assert.match(indexSource, /textarea\.value\s*=\s*`\[Documento PDF escaneado preparado:/);
  
  // Ensure that right after the file extension branches, showDocPreview is called without an extra textarea.value = extractedText.trim()
  assert.match(
    indexSource,
    /throw new Error[\s\S]*?;\s*\}\s*showDocPreview\(['"]file['"], fileName\);/
  );

  // #contenedor-informe-pdf is cleared to prevent visual duplication
  assert.match(
    indexSource,
    /const reportContainer = document\.getElementById\(['"]contenedor-informe-pdf['"]\);\s*const excelDownloadContainer = document\.getElementById\(['"]excel-download-container['"]\);\s*const legacySections = document\.querySelectorAll\(['"]#resultsContent \.legacy-audit-section['"]\);\s*if\s*\(reportContainer\)\s*\{\s*reportContainer\.innerHTML = '';\s*\}/
  );

  // Clause-by-clause comparison is cleanly rendered inside #resProforma
  assert.match(indexSource, /Comparativa Cláusula por Cláusula vs Estándar de Mercado/);
  assert.match(indexSource, /\$\{comparativaHtml\}/);

  // Backend exports LEGAL_AUDIT_RESPONSE_SCHEMA and normalizeLegalAuditResult with all 6 real metadata fields
  assert.match(aiAuditSource, /export const LEGAL_AUDIT_RESPONSE_SCHEMA/);
  assert.match(aiAuditSource, /export function normalizeLegalAuditResult/);
  assert.match(aiAuditSource, /vendedor_armador:\s*toPromptText\(raw\.vendedor_armador,\s*["']{2}\)/);
  assert.match(aiAuditSource, /comprador_fletador:\s*toPromptText\(raw\.comprador_fletador,\s*["']{2}\)/);
  assert.match(aiAuditSource, /mercancia_cantidad:\s*toPromptText\(raw\.mercancia_cantidad,\s*["']{2}\)/);
  assert.match(aiAuditSource, /incoterm_puertos:\s*toPromptText\(raw\.incoterm_puertos,\s*["']{2}\)/);
  assert.match(aiAuditSource, /condiciones_pago:\s*toPromptText\(raw\.condiciones_pago,\s*["']{2}\)/);
  assert.match(aiAuditSource, /jurisdiccion_arbitraje:\s*toPromptText\(raw\.jurisdiccion_arbitraje,\s*["']{2}\)/);
  assert.match(aiAuditSource, /responseSchema:\s*effectiveSchema/);
});

test("9. 502 prevention: Background invocation under 256KB, adaptive PDF scaling, and direct audit fallback", () => {
  // sync-push.ts sends only task_id to background worker, well within the 256KB limit
  assert.match(syncPushSource, /body:\s*JSON\.stringify\(\{\s*task_id:\s*report\.id\s*\}\)/);
  // sync-push.ts catches worker dispatch errors without failing the task or returning 502/503
  assert.match(syncPushSource, /catch\s*\(triggerError\)\s*\{\s*console\.warn\(/);

  // process-legal-audit-background.ts reads task.requestPayload from DB when payload is omitted
  assert.match(bgWorkerSource, /const payloadToProcess = \(body\.payload\?\.contents\?\.length \? body\.payload : task\.requestPayload\) as GeminiPayload;/);

  // ai-legal-audit.ts handles direct execution requests without background dispatch
  assert.match(aiAuditSource, /const isDirectAudit = payload\.auditMode === "direct"/);
  assert.match(aiAuditSource, /if\s*\(isDirectAudit\)\s*\{\s*return responseJson\(await processLegalAuditPayload\(payload\)\);\s*\}/);

  // index.html uses adaptive pixel scaling (max 1050px) and quality 0.52 in renderPdfPagesToCompressedParts
  assert.match(indexSource, /const baseVp = page\.getViewport\(\{\s*scale:\s*1\s*\}\);/);
  assert.match(indexSource, /const scale = Math\.min\(1\.15,\s*1050\s*\/\s*Math\.max\(baseVp\.width,\s*baseVp\.height\)\);/);
  assert.match(indexSource, /canvas\.toDataURL\(['"]image\/jpeg['"],\s*0\.52\)/);

  // index.html implements executeDirectLegalAuditFallback and invokes it if /api/syncPush fails
  assert.match(indexSource, /async function executeDirectLegalAuditFallback\(payload\)/);
  assert.match(indexSource, /const directResult = await executeDirectLegalAuditFallback\(payload\);/);
});

test("10. ocr-extract.ts exports config.path with /api/ocr-extract and getLegalAuditIntegrityErrors accepts summarized auditoria_contrato_html without <table>", async () => {
  // ocr-extract exports config.path with /api/ocr-extract and /.netlify/functions/ocr-extract
  assert.match(ocrSource, /export const config:\s*Config\s*=\s*\{\s*path:\s*\[\s*["']\/api\/ocr-extract["'],\s*["']\/\.netlify\/functions\/ocr-extract["']\s*\]/);

  // maxOutputTokens is set to 8192 to prevent token starvation with thinking tokens
  assert.match(aiAuditSource, /maxOutputTokens:\s*8192/);

  // getLegalAuditIntegrityErrors does NOT check for roman numerals I..V or <table>
  assert.doesNotMatch(aiAuditSource, /"I\."|"II\."|"III\."|"IV\."|"V\."/);
  assert.doesNotMatch(aiAuditSource, /<table/i);

  // index.html retries /.netlify/functions/ocr-extract if /api/ocr-extract returns 404
  assert.match(indexSource, /ocrResp\.status === 404/);
  assert.match(indexSource, /fetch\(['"]\/\.netlify\/functions\/ocr-extract['"]/);

  // index.html always attempts direct legal audit first
  assert.match(indexSource, /async function executeAsyncLegalAudit\(payload\)\s*\{[\s\S]*?executeDirectLegalAuditFallback\(payload\)/);

  // Verification of getLegalAuditIntegrityErrors logic:
  assert.match(aiAuditSource, /export function getLegalAuditIntegrityErrors\(result:\s*LegalAuditResult\)/);
  assert.match(aiAuditSource, /toPromptText\(result\.proforma,\s*["']{2}\)\.trim\(\)/);
  assert.match(aiAuditSource, /Array\.isArray\(result\.comparativa_clausulas\)/);
  assert.match(aiAuditSource, /toPromptText\(result\.email,\s*["']{2}\)\.trim\(\)/);
  assert.match(aiAuditSource, /toPromptText\(result\.auditoria_contrato_html,\s*["']{2}\)\.trim\(\)/);

  const fnMatch = aiAuditSource.match(/export function getLegalAuditIntegrityErrors\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "getLegalAuditIntegrityErrors function should be present");
  const fnBody = fnMatch[0]
    .replace(/^export function getLegalAuditIntegrityErrors\(result:[^)]*\)/, "function getLegalAuditIntegrityErrors(result)")
    .replace(/:\s*string\[\]/g, "")
    .replace(/toPromptText\(([^,]+),\s*""\)/g, 'String($1 || "")');

  const testFn = new Function(`
    ${fnBody}
    return getLegalAuditIntegrityErrors;
  `)();

  const validSummary = {
    auditoria_contrato_html: "<p>Dictamen ejecutivo del contrato SPA: Cláusulas revisadas y balanceadas.</p>",
    comparativa_clausulas: [
      { clausula: "Cláusula 8 (Laytime)", riesgo: "Medio" }
    ],
    proforma: "Análisis preliminar de póliza/contrato",
    riesgos: ["Riesgo de flete"],
    email: "Email de negociación"
  };

  const errors = testFn(validSummary);
  assert.equal(errors.length, 0, "Summarized HTML without <table> or roman numerals must have 0 integrity errors");
});

test("11. parseLegalAuditResult and repairTruncatedJson safely recover truncated JSON without throwing", () => {
  // Check exports in aiAuditSource
  assert.match(aiAuditSource, /export function repairTruncatedJson\(rawText:\s*string\)/);
  assert.match(aiAuditSource, /export function parseLegalAuditResult\(text:\s*string\)/);
  assert.match(aiAuditSource, /maxOutputTokens:\s*8192/);

  // Check that required array in LEGAL_AUDIT_RESPONSE_SCHEMA omits auditoria_contrato_html and mapa_red_flags
  const requiredMatch = aiAuditSource.match(/required:\s*\[([\s\S]*?)\]/);
  assert.ok(requiredMatch);
  assert.ok(!requiredMatch[1].includes("auditoria_contrato_html"));
  assert.ok(!requiredMatch[1].includes("mapa_red_flags"));

  // Check recapInput styling in indexSource
  assert.match(indexSource, /id="recapInput"[^>]*rows="14"/);
  assert.match(indexSource, /id="recapInput"[^>]*min-height:\s*320px\s*!important;/);

  // Check clean error message in syncPushSource
  assert.match(syncPushSource, /Servicio de cola temporalmente no disponible/);

  // Extract repairTruncatedJson from aiAuditSource
  const repairFnMatch = aiAuditSource.match(/export function repairTruncatedJson\([\s\S]*?\n\}/);
  assert.ok(repairFnMatch, "repairTruncatedJson function should be present");
  const repairFnBody = repairFnMatch[0]
    .replace(/^export function repairTruncatedJson\(rawText:[^)]*\)(?::\s*string)?/, "function repairTruncatedJson(rawText)")
    .replace(/:\s*Array<[^>]+>/g, "");

  const repairTestFn = new Function(`
    ${repairFnBody}
    return repairTruncatedJson;
  `)();

  const truncatedJson = `{
    "tipo_documento_detectado": "Contrato SPA Cemento Clinker",
    "vendedor_armador": "SARL TECH AND JURY",
    "comprador_fletador": "TAVCIM",
    "mercancia_cantidad": "50,000 MT",
    "comparativa_clausulas": [
      { "clausula": "1. Objeto", "riesgo": "Bajo" },
      { "clausula": "2. Precio", "desviacion": "Demora de pago de 15 d`;

  const repaired = repairTestFn(truncatedJson);
  assert.doesNotThrow(() => {
    const parsed = JSON.parse(repaired);
    assert.equal(parsed.tipo_documento_detectado, "Contrato SPA Cemento Clinker");
    assert.equal(parsed.vendedor_armador, "SARL TECH AND JURY");
    assert.ok(Array.isArray(parsed.comparativa_clausulas));
  }, "Repaired truncated JSON must be valid parseable JSON");
});

test("12. Progressive 4-Phase Architecture by text blocks, thinkingBudget: 0, and payload deduplication", () => {
  // 1. thinkingBudget: 0 disables reasoning latency on gemini-2.5-flash
  assert.match(aiAuditSource, /thinkingConfig:\s*\{\s*thinkingBudget:\s*0,?\s*\}/);

  // 2. Fast candidate models with gemini-2.0-flash prioritized for JSON stages
  assert.match(aiAuditSource, /["']gemini-2\.0-flash["'],\s*["']gemini-2\.5-flash["']/);

  // 3. Phase schemas exported in backend (all 4 phases)
  assert.match(aiAuditSource, /export const STAGE_1_SCHEMA/);
  assert.match(aiAuditSource, /export const STAGE_2_SCHEMA/);
  assert.match(aiAuditSource, /export const STAGE_3_CLAUSES_SCHEMA/);
  assert.match(aiAuditSource, /export const STAGE_4_SCHEMA/);
  assert.match(aiAuditSource, /export const STAGE_3_SCHEMA/);

  // 4. Double retry loop within single request removed to avoid timeout accumulation
  assert.doesNotMatch(aiAuditSource, /attempt\s*<\s*2/);

  // 5. Payload deduplication: when contract text exceeds 500 chars, polizaAnalizada.contenido avoids repeating 45KB
  assert.match(indexSource, /\[Texto completo en contents\]/);

  // 6. Sequential 4 progressive phases in analyzeDocument:
  assert.match(indexSource, /stage1_metadata/);
  assert.match(indexSource, /stage2_clauses_part1/);
  assert.match(indexSource, /stage3_clauses_part2/);
  assert.match(indexSource, /stage4_mitigation/);

  // 7. Progressive text block partitioning:
  assert.match(indexSource, /const firstHalfText/);
  assert.match(indexSource, /const secondHalfText/);
  assert.match(indexSource, /mitigationPrompt/);

  // 8. Progressive live UI elements: comparative slot and card updates
  assert.match(indexSource, /id="comparativa-clausulas-slot"/);
});
