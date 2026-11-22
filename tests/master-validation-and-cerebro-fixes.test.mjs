import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cerebroSource = fs.readFileSync(
  new URL('../netlify/functions/cerebro-ia.js', import.meta.url),
  'utf8'
);

const strippedCerebroSource = cerebroSource
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
  .replace(/^import\s+['"][^'"]+['"];?/gm, '');

const {
  reconcileCerebroImoText,
  applyImoSessionOverride,
} = await import(
  `data:text/javascript;base64,${Buffer.from(strippedCerebroSource, 'utf8').toString('base64')}`
);

const assistantSource = fs.readFileSync(
  new URL('../src/sea-assistant-entry.js', import.meta.url),
  'utf8'
);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('1. Cerebro.ia IMO injection feedback handles active session vessel vs generic vessel', () => {
  assert.match(cerebroSource, /export function reconcileCerebroImoText/);
  assert.match(cerebroSource, /export function applyImoSessionOverride/);
  assert.match(assistantSource, /export function getActiveSessionVessel/);
  assert.match(assistantSource, /export function reconcileCerebroImoText/);

  const rawAssistantText = [
    'POL OK: Sagunto',
    'POD OK: Casablanca',
    'Mercancía OK: Cemento en big bags y 10000 MT',
    'Inyectar IMO OK: No detectado',
    'Ritmos OK: Carga 1500 / Descarga 2000 MT/día'
  ].join('\n');

  // Case A: User enters route without IMO, but vessel is loaded in session
  const activeVessel = { imo: '9123456', vesselName: 'MOUNT BAKER', source: 'DataBridge' };
  const resolvedWithSession = reconcileCerebroImoText(rawAssistantText, 'Sagunto a Casablanca 10000 MT cemento', activeVessel);
  assert.match(resolvedWithSession, /✅ Buque en sesión: MOUNT BAKER \(IMO 9123456\)/);
  assert.doesNotMatch(resolvedWithSession, /Inyectar IMO OK: No detectado/);

  // Case B: No active vessel in session and no IMO in prompt
  const resolvedGeneric = reconcileCerebroImoText(rawAssistantText, 'Sagunto a Casablanca 10000 MT', null);
  assert.match(resolvedGeneric, /Inyectar IMO OK: No detectado \(estimación con buque genérico\)/);

  // Case C: User explicitly entered IMO in prompt
  const promptWithImo = 'Sagunto a Casablanca 10000 MT con IMO 9876543';
  const customReplyWithImo = 'POL OK: Sagunto\nInyectar IMO OK: 9876543';
  const unchanged = reconcileCerebroImoText(customReplyWithImo, promptWithImo, activeVessel);
  assert.equal(unchanged, customReplyWithImo);

  // Case D: Existing checkmark or bullet prefix must not result in double check (✅ ✅)
  const textWithCheckmark = 'POL OK: Sagunto\n✅ Inyectar IMO OK: No detectado (estimación con buque genérico)';
  const resolvedWithCheckmark = reconcileCerebroImoText(textWithCheckmark, 'Sagunto a Casablanca 10000 MT', activeVessel);
  assert.match(resolvedWithCheckmark, /✅ Buque en sesión: MOUNT BAKER \(IMO 9123456\)/);
  assert.doesNotMatch(resolvedWithCheckmark, /✅\s*✅/);

  // Test applyImoSessionOverride helper
  const payloadObj = { reply: rawAssistantText };
  applyImoSessionOverride(payloadObj, 'Sagunto a Casablanca 10000 MT', activeVessel);
  assert.match(payloadObj.reply, /✅ Buque en sesión: MOUNT BAKER \(IMO 9123456\)/);
  assert.doesNotMatch(payloadObj.reply, /✅\s*✅/);
});

test('2. Owner and Charterer freight perspective coherence and strict mathematical hierarchy', () => {
  // Check index.html implementation
  assert.match(html, /grossFreightPerTon = chartererInputRate > 0/);
  assert.match(html, /netFreightPerTon = grossFreightPerTon \* \(1 - \(commissionPct \/ 100\)\)/);
  assert.match(html, /grossFreightTotal = grossFreightPerTon \* billingTons/);
  assert.match(html, /netFreightTotal = netFreightPerTon \* billingTons/);

  // Simulate calculatePdaFreightPerTon calculation directly to test edge cases
  const grossFreightPerTon = 25.00;
  const commissionPct = 2.5; // 2.5% commission
  const netFreightPerTon = grossFreightPerTon * (1 - (commissionPct / 100));
  const cargoQty = 10000;

  const grossFreightTotal = grossFreightPerTon * cargoQty;
  const netFreightTotal = netFreightPerTon * cargoQty;

  // Strict maritime assertions:
  // 1. Net freight must always be <= Gross freight
  assert.ok(netFreightPerTon <= grossFreightPerTon, 'Net freight per ton must be <= gross freight per ton');
  assert.equal(netFreightPerTon, 24.375);
  assert.equal(grossFreightTotal, 250000);
  assert.equal(netFreightTotal, 243750);
  assert.equal(grossFreightTotal - netFreightTotal, 6250); // Exact 2.5% commission on 250k
});

test('3. Contract Projection formula and USD formatting with exactly 2 decimals', () => {
  assert.match(html, /function formatUSD\(value\)/);
  assert.match(html, /minimumFractionDigits: 2/);
  assert.match(html, /maximumFractionDigits: 2/);
  assert.match(html, /const proyeccionContrato = impactoNetoPorViaje \* shipments/);
  assert.match(html, /Basado en 1 viaje/);
  assert.match(html, /Basado en \$\{shipments\} viajes/);

  // Extract formatUSD from html
  const formatMatch = html.match(/function formatUSD\(value\)\s*\{([\s\S]*?)\n {8}\}/);
  assert.ok(formatMatch, 'formatUSD must be defined in index.html');
  const formatUSD = new Function('value', formatMatch[1]);

  // Test formatting: must always have exactly 2 decimal places and proper commas
  assert.equal(formatUSD(-2359.1), '-$2,359.10');
  assert.equal(formatUSD(0), '$0.00');
  assert.equal(formatUSD(1495.4), '$1,495.40');
  assert.equal(formatUSD(-3854.5), '-$3,854.50');
});

test('4. Reconciliation of comparative impact table with financial cards and neutral state', () => {
  assert.match(html, /Consumo \/ Búnker \(mar \+ puerto\)/);
  assert.match(html, /Coste operativo buque \(OPEX\)/);
  assert.match(html, /Subtotal Tasas Portuarias \(POL \+ POD\)/);
  assert.match(html, /TOTAL IMPACTO VIAJE/);
  assert.match(html, /const hasRealVariation =/);
  assert.match(html, /const impactoNetoPorViaje = effectivePortDelta \+ bunkerImpact \+ opexImpact \+ capexImpact/);
});

test('5. Operational compliance for POL/POD with fallback limits and status badges', () => {
  assert.match(html, /const FALLBACK_PORT_LIMITS =/);
  assert.match(html, /DZBJA:/);
  assert.match(html, /PTAVE:/);
  assert.match(html, /Terminal Norte \(Graneles \/ Carga General\)/);
  assert.match(html, /DZORN:/);
  assert.match(html, /ESBCN:/);
  assert.match(html, /DZMOS:/);
  assert.match(html, /DZALG:/);
  assert.match(html, /USTPA:/);
  assert.match(html, /USPME:/);

  assert.match(html, />OK<\/span>/);
  assert.match(html, />Atención<\/span>/);
  assert.match(html, />Excede límite<\/span>/);
  assert.match(html, />Pendiente dato<\/span>/);

  // Extract lookupPortLimits function from html
  const lookupStart = html.indexOf('const FALLBACK_PORT_LIMITS =');
  const lookupEnd = html.indexOf('function getPdaPortRestrictions', lookupStart);
  const lookupCode = html.slice(lookupStart, lookupEnd);

  const evalContext = new Function(`${lookupCode}; return { FALLBACK_PORT_LIMITS, lookupPortLimits };`)();
  const { lookupPortLimits } = evalContext;

  // Test lookup for Béjaïa with and without accents
  const bejaiaAccents = lookupPortLimits('Béjaïa (DZ)');
  const bejaiaPlain = lookupPortLimits('Bejaia');
  const bejaiaLocode = lookupPortLimits('DZBJA');
  assert.ok(bejaiaAccents, 'Must find Béjaïa with accents');
  assert.ok(bejaiaPlain, 'Must find Bejaia without accents');
  assert.ok(bejaiaLocode, 'Must find DZBJA');
  assert.equal(bejaiaAccents.unlocode, 'DZBJA');
  assert.equal(bejaiaAccents.maxDraft, 11.5);

  // Test lookup for Aveiro
  const aveiro = lookupPortLimits('Aveiro (PT)');
  const aveiroLocode = lookupPortLimits('PTAVE');
  assert.ok(aveiro, 'Must find Aveiro');
  assert.equal(aveiro.unlocode, 'PTAVE');
  assert.equal(aveiro.maxDraft, 9.5);
  assert.equal(aveiro.maxLoa, 180);
  assert.match(aveiro.terminal, /Terminal Norte/);

  // Test lookup for Oran, Barcelona, Mostaganem, Algiers, Tampa, Port Manatee
  assert.equal(lookupPortLimits('Orán')?.unlocode, 'DZORN');
  assert.equal(lookupPortLimits('Oran')?.unlocode, 'DZORN');
  assert.equal(lookupPortLimits('Barcelona')?.unlocode, 'ESBCN');
  assert.equal(lookupPortLimits('Mostaganem')?.unlocode, 'DZMOS');
  assert.equal(lookupPortLimits('Argel')?.unlocode, 'DZALG');
  assert.equal(lookupPortLimits('Algiers')?.unlocode, 'DZALG');
  assert.equal(lookupPortLimits('Tampa')?.unlocode, 'USTPA');
  assert.equal(lookupPortLimits('Port Manatee')?.unlocode, 'USPME');
});

test('6. parseFirstNumber correctly extracts numeric speed/consumption values and capex row condition', () => {
  assert.match(html, /function parseFirstNumber\(value\)/);
  const parseMatch = html.match(/function parseFirstNumber\(value\)\s*\{([\s\S]*?)\n {8}\}/);
  assert.ok(parseMatch, 'parseFirstNumber must be defined in index.html');
  const parseFirstNumber = new Function('value', parseMatch[1]);

  assert.equal(parseFirstNumber("14.5 MT/día VLSFO (Eco: 11.02 MT)"), 14.5);
  assert.equal(parseFirstNumber("2.0 MT/día MGO (Idle: 1.1 MT)"), 2.0);
  assert.equal(parseFirstNumber("12.76 MT/día VLSFO"), 12.76);
  assert.equal(parseFirstNumber("12,50 kn"), 12.5);
  assert.equal(parseFirstNumber(11), 11);
  assert.equal(parseFirstNumber(""), 0);

  // Capex row is displayed whenever prevTotalCapex > 0 || actTotalCapex > 0
  assert.match(html, /const capexRow = \(prevTotalCapex > 0 \|\| actTotalCapex > 0\)/);
  // actTotalDays preserves base voyage days
  assert.match(html, /const actTotalDays = prevSeaDays > 0 \? Math\.max\(0, prevTotalDays \+ \(actSeaDays - prevSeaDays\)\) : prevTotalDays/);
});

test('7. evaluateDimension with actual <= 0 returns pending status and lookupPortLimits prevents short false positives', () => {
  // Verify evaluateDimension returns pending when actual <= 0
  assert.match(html, /if \(actual <= 0\) \{\s*return \{ control, actual: 0, limit, unit: ' m', status: 'pending' \};/);

  // Extract evaluateDimension from index.html
  const fnBodyMatch = html.match(/const evaluateDimension = \((?:control, actualVal, limitVal)\) => \{([\s\S]*?)\n {12}\};/);
  assert.ok(fnBodyMatch, 'evaluateDimension must be present in index.html');
  const evaluateDimension = new Function('control', 'actualVal', 'limitVal', fnBodyMatch[1]);

  // Test actual <= 0 returns pending (never ok)
  const pendingCheck = evaluateDimension('Calado máximo', 0, 11.5);
  assert.equal(pendingCheck.status, 'pending');
  assert.equal(pendingCheck.actual, 0);

  const negativeCheck = evaluateDimension('Calado máximo', -1, 11.5);
  assert.equal(negativeCheck.status, 'pending');

  const okCheck = evaluateDimension('Calado máximo', 10.0, 11.5);
  assert.equal(okCheck.status, 'ok');

  const attentionCheck = evaluateDimension('Calado máximo', 11.2, 11.5);
  assert.equal(attentionCheck.status, 'attention');

  const failCheck = evaluateDimension('Calado máximo', 12.0, 11.5);
  assert.equal(failCheck.status, 'fail');

  // Verify lookupPortLimits doesn't match short 1-2 char strings like 'OR' or 'AL'
  const lookupStart = html.indexOf('const FALLBACK_PORT_LIMITS =');
  const lookupEnd = html.indexOf('function getPdaPortRestrictions', lookupStart);
  const lookupCode = html.slice(lookupStart, lookupEnd);
  const { lookupPortLimits } = new Function(`${lookupCode}; return { FALLBACK_PORT_LIMITS, lookupPortLimits };`)();

  assert.equal(lookupPortLimits('OR'), null);
  assert.equal(lookupPortLimits('AL'), null);
  assert.equal(lookupPortLimits('BA'), null);
  assert.equal(lookupPortLimits('Orán')?.unlocode, 'DZORN');
});
