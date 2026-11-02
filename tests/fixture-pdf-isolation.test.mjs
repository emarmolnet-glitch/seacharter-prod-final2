import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('both commercial entries bypass PDF libraries and the annex skips SVG rasterization', () => {
  for (const file of ['index.html', 'decisiones.html']) {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('async function generateFixtureRecapPDF(');
    const end = html.indexOf('window.generateFixtureRecapPDF =', start);
    assert.match(html, /src="\/fixture-native-print.js"/);
    assert.match(html.slice(start, end), /window.printFixtureRecap\(htmlString\)/);
    assert.doesNotMatch(html.slice(start, end), /html2pdf|html2canvas|toDataURL|exportFixtureRecapInFrame/);
  }
  const entry = fs.readFileSync('src/voyage-executive-report-entry.jsx', 'utf8');
  assert.doesNotMatch(entry, /textOnly=\{true\}/);
  assert.doesNotMatch(entry, /prepareExecutivePDF|toDataURL/);
});
