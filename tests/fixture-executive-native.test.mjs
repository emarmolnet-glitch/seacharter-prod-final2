import test from 'node:test';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';

const loader = `
import { readFile } from 'node:fs/promises';
import ts from '${import.meta.resolve('typescript')}';
export async function load(url, context, nextLoad) {
  if (!url.endsWith('.jsx')) return nextLoad(url, context);
  const result = ts.transpileModule(await readFile(new URL(url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: url,
  });
  return { format: 'module', source: result.outputText, shortCircuit: true };
}`;
register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);
const { default: Report } = await import('../src/components/VoyageExecutiveReportModal.jsx');

test('commercial annex renders approved freight, clauses and native SVG and technical tables without raster images or private costs', () => {
  const data = { vesselName: 'MV TEST', vesselType: 'Handysize', cargoQty: 5000, cargo: 5000,
    freightSell: 48.7, costBunkers: 987654.32, pol: 'Bilbao', pod: 'Lima',
    fixtureFinancial: { totalFreightGross: 243500 } };
  data.stowagePlan = new Proxy({}, { get() { throw new Error('Global stowage state must not reach the report'); } });
  const window = {};
  vm.runInNewContext(readFileSync('public/fixture-financial-snapshot.js', 'utf8'), { window });
  const cleanState = window.selectFixtureRecapState(data);
  cleanState.fixtureFinancial = data.fixtureFinancial;
  const $ = load(renderToStaticMarkup(React.createElement(Report, {
    voyageData: cleanState, initialClientMode: true,
  })));
  assert.equal($('canvas,img').length, 0);
  assert.equal($('svg').length, 1);
  assert.ok($('svg path').length > 0);
  assert.ok($('svg defs').find('*').toArray().some(node => node.name.toLowerCase() === 'lineargradient'));
  assert.equal($('svg').attr('viewBox'), '0 0 1000 320');
  assert.ok($('table').length >= 1);
  assert.match($.text(), /243,500/);
  assert.equal($('#executive-clauses-list').length, 1);
  assert.doesNotMatch($.text(), /987,654\.32/);
});

test('native print restores corporate blocks, exact colors and page rules on the actual Recap and annex', async () => {
  const entry = readFileSync('index.html', 'utf8');
  const start = entry.indexOf('function resolveFixtureRecapOperations(');
  const end = entry.indexOf('window.buildFixtureRecapHTMLTemplate =', start);
  const renderRecap = new Function('state', `${entry.slice(start, end)}; return buildFixtureRecapHTMLTemplate(state);`);
  const data = { vesselName: 'MV TEST', vesselType: 'Handysize', pol: 'Bilbao', pod: 'Lima', cargo: 5000, cargoQty: 5000,
    commodity: 'Steel', allInRateGross: 48.7, freightSell: 48.7, loadRate: 5000, dischargeRate: 2000,
    fixtureFinancial: { totalFreightGross: 243500, unitRateText: '48.70', totalFreightText: '243,500' } };
  const annex = renderToStaticMarkup(React.createElement(Report, { voyageData: data, initialClientMode: true }));
  const report = load(annex);
  const reportBody = report('#voyage-executive-report-modal').children().first().toString();
  const html = `${renderRecap(data)}<section class="fixture-executive-appendix">${reportBody}</section>`;
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<body></body>');
    // Native printing is intercepted; all document construction and CSS are real.
    await page.evaluate(() => {
      const append = Element.prototype.appendChild;
      Element.prototype.appendChild = function(node) {
        const result = append.call(this, node);
        if (node.querySelector?.('iframe')) node.querySelector('iframe').contentWindow.print = () => {};
        return result;
      };
    });
    await page.addScriptTag({ content: readFileSync('public/fixture-native-print.js', 'utf8') });
    await page.evaluate(html => window.printFixtureRecap(html), html);
    const documentHTML = await page.evaluate(() => document.querySelector('iframe').contentDocument.documentElement.outerHTML);
    // Test the sanitized document in actual print media, independent of the app shell.
    await page.setContent(documentHTML);
    await page.emulateMediaType('print');
    const styles = await page.evaluate(() => {
      const read = selector => {
        const node = document.querySelector(selector);
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, color: css.color, border: css.borderTopWidth,
          bottom: css.marginBottom, inside: css.breakInside, before: css.breakBefore,
          after: css.breakAfter, adjust: css.printColorAdjust, weight: css.fontWeight, columns: css.gridTemplateColumns };
      };
      return { section: read('.recap-section'), heading: read('.recap-title'), table: read('table'),
        th: read('th'), stripe: read('tbody tr:nth-child(2) td'), card: read('.native-card'),
        offer: read('.native-offer'), clauses: read('.native-clauses'), annex: read('.fixture-executive-appendix'),
        grid: read('.native-executive-body > .grid'), header: read('.native-executive-header'),
        svgWidth: document.querySelector('svg').getBoundingClientRect().width,
        svgHeight: document.querySelector('svg').getBoundingClientRect().height,
        pageWidth: document.querySelector('main').getBoundingClientRect().width };
    });
    assert.equal(styles.section.background, 'rgb(248, 250, 252)');
    assert.equal(styles.section.border, '1px');
    assert.equal(styles.section.bottom, '20px');
    assert.equal(styles.section.inside, 'avoid');
    assert.equal(styles.section.adjust, 'exact');
    assert.equal(styles.heading.after, 'avoid');
    assert.equal(styles.th.background, 'rgb(51, 65, 85)');
    assert.equal(styles.th.color, 'rgb(255, 255, 255)');
    assert.equal(styles.stripe.background, 'rgb(241, 245, 249)');
    assert.equal(styles.card.border, '1px');
    assert.equal(styles.offer.background, 'rgb(240, 248, 244)');
    assert.equal(styles.clauses.inside, 'avoid');
    assert.equal(styles.table.inside, 'avoid');
    assert.equal(styles.annex.before, 'page');
    assert.equal(styles.header.adjust, 'exact');
    assert.ok(styles.grid.columns.split(' ').length === 2);
    assert.ok(styles.svgWidth > 0 && styles.svgWidth <= styles.pageWidth);
    assert.ok(styles.svgHeight > 0);
    // Exercise Chromium's native PDF engine, including colors with backgrounds disabled.
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: false });
    assert.ok(pdf.length > 10000);
  } finally { await browser.close(); }
});

const source = readFileSync('public/fixture-native-print.js', 'utf8');

test('native preview prints approved text and tables, preserves SVG and strips raster graphics, and supports cancel/reprint/close', async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button id="origin">Decisiones</button>');
    await page.evaluate(() => {
      window.printCalls = 0;
      window.alert = () => { throw new Error('Unsafe markup executed'); };
      // Count actual native-print calls without opening an OS dialog in automation.
      Object.defineProperty(window, 'printCalls', { value: 0, writable: true });
      const append = Element.prototype.appendChild;
      Element.prototype.appendChild = function (node) {
        const result = append.call(this, node);
        if (node.querySelector?.('iframe')) node.querySelector('iframe').contentWindow.print = () => window.printCalls++;
        return result;
      };
    });
    await page.addScriptTag({ content: source });
    const approved = '<div><style>body{display:none}</style><p onclick="alert(1)">USD 48.70</p><section class="fixture-executive-appendix"><h2>APPROVED ANNEX</h2><img src="data:image/png;base64,AAAA"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 320" width="1000" height="320" onload="alert(1)"><defs><linearGradient id="hull"><stop offset="0%" stop-color="#e5e7eb"/></linearGradient><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0L10 10" stroke="#fff"/></pattern><clipPath id="clip"><rect x="0" y="0" width="1000" height="320"/></clipPath></defs><g transform="translate(5 5)" clip-path="url(#clip)"><path d="M0 0L100 0L50 100Z" fill="url(#hull)" stroke="#334155" stroke-width="2"/><rect width="20" height="20" fill="url(#hatch)"/><text x="10" y="20" text-anchor="middle" font-size="12">VESSEL DIAGRAM</text></g><image href="https://example.invalid/unwanted.png"/><foreignObject><div>UNSAFE SVG HTML</div></foreignObject><circle r="5" fill="url(https://example.invalid/paint.svg)"/></svg><canvas></canvas><table><thead><tr><th>MT</th></tr></thead><tbody><tr><td>5000</td></tr></tbody></table><details><summary>Conditions</summary><p>APPROVED CLAUSE</p></details><p class="hidden">PRIVATE COST</p></section></div>';
    await page.evaluate(html => { document.getElementById('origin').focus(); window.printFixtureRecap(html); }, approved);
    let result = await page.evaluate(() => {
      const doc = document.querySelector('iframe').contentDocument;
      return { text: doc.body.innerText, graphics: doc.querySelectorAll('img,canvas,script,image,foreignObject').length,
        svg: doc.querySelector('svg')?.outerHTML, svgCount: doc.querySelectorAll('svg').length,
        viewBox: doc.querySelector('svg')?.getAttribute('viewBox'),
        event: doc.querySelector('p').getAttribute('onclick'), open: doc.querySelector('details').open,
        count: window.printCalls, tables: doc.querySelectorAll('table').length };
    });
    assert.equal(result.count, 1);
    assert.match(result.text, /USD 48.70/);
    assert.match(result.text, /APPROVED ANNEX/);
    assert.match(result.text, /APPROVED CLAUSE/);
    assert.doesNotMatch(result.text, /PRIVATE COST|UNSAFE SVG HTML/);
    assert.equal(result.graphics, 0);
    assert.equal(result.svgCount, 1);
    assert.equal(result.viewBox, '0 0 1000 320');
    assert.match(result.svg, /linearGradient id="hull"/);
    assert.match(result.svg, /patternUnits="userSpaceOnUse"/);
    assert.match(result.svg, /clipPath id="clip"/);
    assert.match(result.svg, /transform="translate\(5 5\)"/);
    assert.match(result.svg, /fill="url\(#hull\)"/);
    assert.match(result.svg, /stroke-width="2"/);
    assert.match(result.svg, /font-size="12"/);
    assert.doesNotMatch(result.svg, /onload|unwanted|example.invalid/);
    assert.equal(result.event, null);
    assert.equal(result.tables, 1);
    assert.equal(result.open, true);
    await page.evaluate(() => document.querySelector('[role="dialog"] button').click());
    assert.equal(await page.evaluate(() => window.printCalls), 2);
    // A new export replaces the preview rather than accumulating documents.
    await page.evaluate(html => window.printFixtureRecap(html), approved);
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 1);
    await page.evaluate(() => document.querySelector('[role="dialog"] button:last-child').click());
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0);
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(html => window.printFixtureRecap(html), approved);
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length), 0);
  } finally { await browser.close(); }
});
