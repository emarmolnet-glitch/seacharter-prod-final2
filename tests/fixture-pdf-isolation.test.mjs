import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('        async function exportFixtureRecapInFrame(');
const end = html.indexOf('        async function generateFixtureRecapPDF(', start);

function setup(failure = null) {
  let frame, removed = false, options, exported, saved = false;
  const timers = new Map();
  const content = {};
  const pdfDocument = {
    open() {}, write() {}, close() {},
    createElement: tag => ({ tag }),
    getElementById: () => content,
    head: { appendChild(node) {
      if (node.tag === 'script') {
        assert.match(node.src, /html2pdf.*0\.10\.1/);
        queueMicrotask(() => failure === 'load' ? node.onerror() : node.onload());
      }
    } }
  };
  content.ownerDocument = pdfDocument;
  const pdfWindow = { html2pdf: () => ({
    set(value) { options = value; return this; },
    from(value) { exported = value; return this; },
    toPdf() { return this; },
    async get() { if (failure === 'save') throw new Error('Render failed'); return { output: () => 'pdf-blob' }; }
  }) };
  const document = {
    createElement(tag) {
      if (tag === 'a') return { click() { saved = true; }, remove() {} };
      assert.equal(tag, 'iframe');
      return frame = { style: {}, setAttribute() {}, contentDocument: pdfDocument,
        contentWindow: pdfWindow, remove() { removed = true; } };
    },
    body: { appendChild() {} }
  };
  const context = vm.createContext({ document,
    URL: { createObjectURL: () => 'blob:pdf', revokeObjectURL() {} },
    setTimeout(callback, ms) { if (ms === 1000) { queueMicrotask(callback); return 0; } if (!ms) { queueMicrotask(callback); return 0; }
      const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(html.slice(start, end), context);
  return { export: context.exportFixtureRecapInFrame,
    result: () => ({ removed, options, exported, saved, timers, content, frame }) };
}

test('PDF uses the iframe realm and its content, with lighter settings and cleanup', async () => {
  const ctx = setup();
  await ctx.export('<div>Fixture and appendix</div>', 'fixture.pdf');
  const result = ctx.result();
  assert.equal(result.exported, result.content);
  assert.equal(result.exported.innerHTML, '<div>Fixture and appendix</div>');
  assert.equal(result.options.html2canvas.scale, 1);
  assert.ok(!result.options.pagebreak.mode.includes('avoid-all'));
  assert.equal(result.options.filename, 'fixture.pdf');
  assert.equal(result.saved, true);
  assert.equal(result.removed, true);
  assert.equal(result.timers.size, 0);
  assert.ok(!result.frame.style.cssText.includes('display:none'));
});

for (const failure of ['load', 'save']) {
  test(`isolated frame is removed on ${failure} failure`, async () => {
    const ctx = setup(failure);
    await assert.rejects(ctx.export('<p>Fixture</p>', 'fixture.pdf'));
    assert.equal(ctx.result().removed, true);
    assert.equal(ctx.result().timers.size, 0);
  });
}
