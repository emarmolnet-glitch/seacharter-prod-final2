import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('laytime defaults use ISO Alpha-2 country codes while preserving manual overrides', () => {
  const isoArraySource = indexSource.slice(
    indexSource.indexOf('const MUSLIM_MAJORITY_ISO_ALPHA_2'),
    indexSource.indexOf('const LAYTIME_SELECT_IDS')
  );
  ['DZ', 'MA', 'EG', 'SA', 'AE', 'QA'].forEach((countryCode) => {
    assert.ok(isoArraySource.includes(`'${countryCode}'`));
  });
  assert.match(indexSource, /function extractPortCountryIsoAlpha2\(portValue\)/);
  assert.match(indexSource, /MUSLIM_MAJORITY_ISO_ALPHA_2\.includes\(countryCode\) \? 'FHEX' : 'SHEX'/);
  assert.match(indexSource, /select\.dataset\.laytimeManualOverride === 'true'/);
  assert.match(indexSource, /\['port-pol', 'pol'\], \['map-port-pol', 'pol'\]/);
  assert.match(indexSource, /\['port-pod', 'pod'\], \['map-port-pod', 'pod'\]/);
});

test('executive report payload and print view expose precise port operations and contractual terms', () => {
  assert.match(indexSource, /function getExecutiveOperationalTerms\(\)/);
  assert.match(indexSource, /loadMethod: operationalTerms\.loadMethod/);
  assert.match(indexSource, /loadCranes: operationalTerms\.loadCranes/);
  assert.match(indexSource, /dischargeMethod: operationalTerms\.dischargeMethod/);
  assert.match(indexSource, /totalPortDays: operationalTerms\.totalPortDays/);
  assert.match(indexSource, /freightTerms: operationalTerms\.freightTerms/);
  assert.match(indexSource, /id="print-load-method"/);
  assert.match(indexSource, /id="print-discharge-method"/);
  assert.match(indexSource, /id="print-laytime-terms"/);
});

test('executive report keeps OPEX and CAPEX visible with port-day impact', () => {
  assert.match(indexSource, /id="print-cost-opex"/);
  assert.match(indexSource, /id="print-cost-capex"/);
  assert.match(indexSource, /operationalTerms\.totalPortDays\.toFixed\(2\)/);
  assert.match(indexSource, /Bunkers \+ OPEX \+ CAPEX \+ PDAs \+ ETS/);
  assert.match(indexSource, /Impacto días puerto:/);
});

test('print mode isolates the report and neutralizes forced blank page breaks', () => {
  assert.match(indexSource, /body\.print-report-mode > :not\(#executive-report-print-view\)/);
  assert.match(indexSource, /page-break-before: avoid !important/);
  assert.match(indexSource, /page-break-inside: avoid !important/);
  assert.match(indexSource, /body\.print-report-mode #executive-report-print-view \.page-break[\s\S]*?display: none !important/);
  assert.match(indexSource, /break-after: auto !important/);
});
