import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

function readDeclaration(name) {
  const match = frontendSource.match(new RegExp(`const ${name} = [^;]+;`));
  assert.ok(match, `Missing ${name}`);
  return match[0];
}

function loadSanitizer() {
  const helpers = frontendSource.match(/function sanitizeAiText[\s\S]*?(?=\nfunction createThinkingMessage)/)?.[0];
  assert.ok(helpers, 'Missing AI payload sanitizer helpers');
  const source = [
    readDeclaration('AI_HISTORY_LIMIT'),
    readDeclaration('AI_HISTORY_MESSAGE_MAX_CHARS'),
    readDeclaration('AI_USER_CONTEXT_MAX_CHARS'),
    readDeclaration('AI_DATA_TEXT_MAX_CHARS'),
    helpers,
    'this.sanitizePayloadForAI = sanitizePayloadForAI;',
  ].join('\n');
  const context = {};
  vm.runInNewContext(source, context);
  return context.sanitizePayloadForAI;
}

test('assistant sanitizes the payload immediately before serializing the fetch body', () => {
  assert.match(frontendSource, /function sanitizePayloadForAI\(payload = \{\}\)/);
  assert.match(frontendSource, /const sanitizedPayload = sanitizePayloadForAI\(requestPayload\);[\s\S]*body: JSON\.stringify\(sanitizedPayload\)/);
  assert.match(frontendSource, /const AI_HISTORY_LIMIT = 6/);
});

test('sanitized AI payload remains below 1 MB with an oversized 11 MB source', () => {
  const sanitizePayloadForAI = loadSanitizer();
  const massiveBase64 = `data:image/png;base64,${'A'.repeat(6_000_000)}`;
  const massiveVessels = Array.from({ length: 25_000 }, (_, index) => ({ id: index, track: 'X'.repeat(240) }));
  const oversizedPayload = {
    CalculationData: {
      generatedAt: '2026-08-20T00:00:00.000Z',
      activeCalculator: { id: 'estimator', name: 'Calculadora' },
      route: { pol: 'Valencia', pod: 'Orán', distanceNm: 240 },
      cargo: { tonnes: 32_000, type: 'Big Bags' },
      operations: { loadingRateTonnesDay: 4_000, dischargeRateTonnesDay: 3_500 },
      commercial: { freightSellUsdTon: 25, breakEvenUsdTon: 21.4, tceUsdDay: 14_500 },
      screenContext: { radar: massiveVessels, screenshot: massiveBase64 },
      calculatorState: { aisHistory: massiveVessels },
      calculatedState: { fullRadar: massiveVessels },
      voyageDraft: { attachment: massiveBase64 },
    },
    MarketData: {
      bdi: 1_750,
      bunkers: { region: 'MED', vlsfoUsdTon: 610, mgoUsdTon: 830 },
      freightBenchmarks: { spot: 28, coa: 24, backhaul: 20 },
      aisFreightRates: { fair: 26, standard: 28, offmarket: 31 },
      referenceData: { history: massiveVessels, image: massiveBase64 },
      radarHistory: massiveVessels,
    },
    UserContext: 'U'.repeat(2_000_000),
    ConversationHistory: Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `${index}-${'H'.repeat(100_000)}`,
    })),
  };

  assert.ok(Buffer.byteLength(JSON.stringify(oversizedPayload)) > 11_000_000);
  const sanitized = sanitizePayloadForAI(oversizedPayload);
  const serialized = JSON.stringify(sanitized);

  assert.ok(Buffer.byteLength(serialized) < 1_000_000);
  assert.equal(sanitized.ConversationHistory.length, 6);
  assert.ok(sanitized.ConversationHistory.every((entry) => entry.content.length <= 2_001));
  assert.ok(sanitized.UserContext.length <= 8_001);
  assert.equal(sanitized.CalculationData.commercial.breakEvenUsdTon, 21.4);
  assert.equal(sanitized.MarketData.bunkers.vlsfoUsdTon, 610);
  assert.equal('calculatorState' in sanitized.CalculationData, false);
  assert.equal('calculatedState' in sanitized.CalculationData, false);
  assert.equal('voyageDraft' in sanitized.CalculationData, false);
  assert.equal('referenceData' in sanitized.MarketData, false);
  assert.equal(serialized.includes('data:image/png;base64'), false);
});
