import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Market Report: db/market-report.ts contains cargo classification and dynamic narrative assembly logic", () => {
  const marketReportTs = fs.readFileSync(path.join(process.cwd(), "db/market-report.ts"), "utf8");

  assert.match(marketReportTs, /export function classifyCargoCategory/);
  assert.match(marketReportTs, /export function classifyVesselType/);
  assert.match(marketReportTs, /export function assembleExecutiveNarrative/);
  assert.match(marketReportTs, /export async function aggregateLast7DaysMarketData/);
  assert.match(marketReportTs, /Minerales/);
  assert.match(marketReportTs, /Carga Siderúrgica/);
  assert.match(marketReportTs, /Fertilizantes/);
  assert.match(marketReportTs, /Biomasa/);
  assert.match(marketReportTs, /Breakbulk/);
  assert.match(marketReportTs, /Supramax \/ Kamsarmax/);
});

test("Market Report: db/market-report-template.ts applies SeaCharter Core PRO authorship and clean light design without dark backgrounds", () => {
  const templateTs = fs.readFileSync(path.join(process.cwd(), "db/market-report-template.ts"), "utf8");

  assert.match(templateTs, /export function buildMarketReportHtmlTemplate/);
  assert.match(templateTs, /SeaCharter Core PRO/);
  assert.doesNotMatch(templateTs, /Rodahmar Shipping/); // Rodahmar removed as issuer
  assert.match(templateTs, /#00875A/); // Emerald Green accent
  assert.match(templateTs, /background:\s*#FFFFFF/); // Clean white header/card styling
  assert.doesNotMatch(templateTs, /\.header\s*\{\s*background:\s*#0A192F/); // No dark header background
  assert.match(templateTs, /Termómetro Operativo y Reposicionamiento/);
  assert.match(templateTs, /riskAlerts\.jwcZones/);
});

test("Market Report: db/market-report-pdf.ts configures Puppeteer PDF generation", () => {
  const pdfTs = fs.readFileSync(path.join(process.cwd(), "db/market-report-pdf.ts"), "utf8");

  assert.match(pdfTs, /export async function generateMarketReportPdfBuffer/);
  assert.match(pdfTs, /puppeteer/);
  assert.match(pdfTs, /format:\s*"A4"/);
  assert.match(pdfTs, /printBackground:\s*true/);
});

test("Market Report: Netlify functions declare on-demand path and Friday 8:00 AM cron schedule", () => {
  const onDemandTs = fs.readFileSync(path.join(process.cwd(), "netlify/functions/rodahmar-market-report.ts"), "utf8");
  const cronTs = fs.readFileSync(path.join(process.cwd(), "netlify/functions/rodahmar-market-report-cron.ts"), "utf8");

  assert.match(onDemandTs, /path:\s*["']\/api\/rodahmar-market-report["']/);
  assert.match(onDemandTs, /aggregateLast7DaysMarketData/);
  assert.match(onDemandTs, /generateMarketReportPdfBuffer/);
  assert.match(onDemandTs, /Content-Type":\s*"application\/pdf"/);

  assert.match(cronTs, /schedule:\s*["']0 8 \* \* 5["']/);
});

test("Market Report: UI buttons are present in index.html and dist/index.html", () => {
  const indexPath = path.join(process.cwd(), "index.html");
  const distIndexPath = path.join(process.cwd(), "dist/index.html");

  const indexContent = fs.readFileSync(indexPath, "utf8");
  const distIndexContent = fs.readFileSync(distIndexPath, "utf8");

  // Section 5 button in Audit module
  assert.match(indexContent, /id="btn-market-report"/);
  assert.match(indexContent, /Generar Reporte de Mercado Actual/);
  assert.match(distIndexContent, /id="btn-market-report"/);
  assert.match(distIndexContent, /Generar Reporte de Mercado Actual/);

  // Top navigation menu button
  assert.match(indexContent, /id="btn-market-report-nav"/);
  assert.match(indexContent, /<span>Reporte de Mercado<\/span>/);
  assert.match(distIndexContent, /id="btn-market-report-nav"/);
  assert.match(distIndexContent, /<span>Reporte de Mercado<\/span>/);

  // JS handler attachment
  assert.match(indexContent, /async function generateMarketReport/);
  assert.match(indexContent, /SeaCharter_Core_PRO_Market_Report_/);
  assert.match(distIndexContent, /async function generateMarketReport/);
  assert.match(distIndexContent, /SeaCharter_Core_PRO_Market_Report_/);
});
