import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer";

async function launchBrowser(): Promise<Browser> {
  try {
    const chromium = await import("@sparticuz/chromium");
    const puppeteerCore = await import("puppeteer-core");
    const executablePath = await chromium.default.executablePath();
    if (executablePath) {
      return (await puppeteerCore.default.launch({
        args: chromium.default.args,
        defaultViewport: chromium.default.defaultViewport,
        executablePath,
        headless: Boolean(chromium.default.headless),
      })) as unknown as Browser;
    }
  } catch (e) {
    // fallback
  }

  return (await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })) as unknown as Browser;
}

export async function generateMarketReportPdfBuffer(htmlContent: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfUint8Array = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      scale: 1,
    });
    return Buffer.from(pdfUint8Array);
  } finally {
    await browser.close();
  }
}
