import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mammoth from 'mammoth';

const decisionSupportModule = readFileSync(new URL('../src/DecisionSupportModule.js', import.meta.url), 'utf8');
const decisionesHtml = readFileSync(new URL('../decisiones.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('DSS: Button "Generar LOI (Word)" is injected next to "Imprimir Oferta (Fixture Recap)" with identical classes', () => {
  const targetClass = 'px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer';

  for (const [name, content] of [
    ['DecisionSupportModule.js', decisionSupportModule],
    ['decisiones.html', decisionesHtml],
    ['index.html', indexHtml],
  ]) {
    assert.match(content, /id="btn-generate-loi-word"/, `${name} must include #btn-generate-loi-word`);
    assert.match(content, /onclick="handleDownloadLOI\(\)"/, `${name} must bind onclick to handleDownloadLOI()`);
    assert.match(content, /Generar LOI \(Word\)/, `${name} must display 'Generar LOI (Word)' text`);
    assert.ok(content.includes(targetClass), `${name} must share identical CSS/Tailwind classes with adjacent button`);
  }
});

test('DSS: handleDownloadLOI is defined and exported on window', () => {
  for (const [name, content] of [
    ['DecisionSupportModule.js', decisionSupportModule],
    ['decisiones.html', decisionesHtml],
    ['index.html', indexHtml],
  ]) {
    assert.match(content, /handleDownloadLOI/, `${name} must define handleDownloadLOI`);
    assert.match(content, /window\.handleDownloadLOI = handleDownloadLOI;/, `${name} must expose handleDownloadLOI on window`);
    assert.match(content, /\/\.netlify\/functions\/generate-loi/, `${name} must POST to /.netlify/functions/generate-loi`);
    assert.match(content, /LOI_.*\.docx/, `${name} must trigger download matching LOI_[POL]_[POD].docx`);
  }
});

test('Backend: netlify/functions/generate-loi.js generates valid Word document and queries Neon', async () => {
  const { handler } = await import('../netlify/functions/generate-loi.js');
  
  const payload = {
    pol: 'Antwerp',
    pod: 'Veracruz',
    mercancia: 'Clinker de Cemento'
  };

  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify(payload)
  });

  assert.equal(response.statusCode, 200, 'Must return status 200');
  assert.equal(response.isBase64Encoded, true, 'Must return isBase64Encoded: true');
  assert.equal(response.headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(response.headers['Content-Disposition'], 'attachment; filename="LOI.docx"');
  assert.ok(response.body && typeof response.body === 'string' && response.body.length > 100, 'Body must be base64 string');

  const buf = Buffer.from(response.body, 'base64');
  const extracted = await mammoth.extractRawText({ buffer: buf });
  const text = extracted.value;

  assert.match(text, /Antwerp/, 'Document must contain received POL');
  assert.match(text, /Veracruz/, 'Document must contain received POD');
  assert.match(text, /Clinker de Cemento/, 'Document must contain received Mercancía');
  assert.match(text, /Letter of Indemnity/i, 'Document must contain LOI clause from Neon or fallback');
});
