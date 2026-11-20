import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

try {
  register(new URL('./jsx-loader.mjs', import.meta.url));
} catch (_) {}

const drawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');

test('1. extractDynamicAuditContext: aislar activeScreenContext y fullAuditData en auditoría documental activa', async () => {
  const { extractDynamicAuditContext, hasRealCalculatorData } = await import('../src/components/GlobalMadreDrawer.jsx');

  const originalDoc = globalThis.document;
  const originalWindow = globalThis.window;

  try {
    // Escenario A: Usuario en Módulo 5 (Auditoría IA) con documento cargado y calculadora vacía
    const mockElements = {
      '#view-auditor': {
        id: 'view-auditor',
        classList: { contains: (cls) => cls === 'active-flex' },
        querySelectorAll: () => []
      },
      '#view-estimator': {
        id: 'view-estimator',
        classList: { contains: (cls) => cls === 'hidden' },
        querySelectorAll: () => []
      },
      '#resultsContent': {
        id: 'resultsContent',
        classList: { contains: () => false },
        querySelectorAll: (sel) => {
          if (sel === 'table') {
            return [{
              id: 'tabla-audit-1',
              hidden: false,
              classList: { contains: () => false },
              querySelectorAll: (sub) => {
                if (sub === 'th') return [{ textContent: 'Cláusula' }, { textContent: 'Dictamen' }];
                if (sub === 'tbody tr, tr') return [{
                  querySelectorAll: (td) => td === 'td' ? [{ textContent: 'Cláusula 5' }, { textContent: 'Aceptable' }] : []
                }];
                return [];
              }
            }];
          }
          if (sel.includes('.alert')) {
            return [{
              textContent: 'Riesgo legal detectado en Cláusula 2',
              hidden: false,
              classList: { contains: () => false }
            }];
          }
          return [];
        }
      },
      '#recapInput': { value: 'VOYAGE CHARTER PARTY GENCON 1994...' },
      '#doc-badge': { textContent: 'GENCON' }
    };

    globalThis.document = {
      getElementById: (id) => mockElements[`#${id}`] || null,
      querySelector: (sel) => {
        if (sel.includes('#resultsContent')) return mockElements['#resultsContent'];
        if (sel.includes('#view-auditor')) return mockElements['#view-auditor'];
        if (sel.includes('#view-estimator')) return mockElements['#view-estimator'];
        return mockElements[sel] || null;
      },
      querySelectorAll: () => []
    };

    globalThis.window = {
      State: {
        rawDocumentText: 'VOYAGE CHARTER PARTY GENCON 1994...',
        cargoQty: 0,
        freightRate: 0
      }
    };

    // La calculadora no tiene datos reales
    assert.equal(hasRealCalculatorData(), false);

    const auditContext = extractDynamicAuditContext();

    // fullAuditData se extrae de resultados/auditoría
    assert.equal(auditContext.fullAuditData.modulo_activo, 'auditoria');
    assert.equal(auditContext.fullAuditData.tablas.length, 1);
    assert.equal(auditContext.fullAuditData.tablas[0].headers[0], 'Cláusula');
    assert.equal(auditContext.fullAuditData.alertas.length, 1);
    assert.equal(auditContext.fullAuditData.alertas[0], 'Riesgo legal detectado en Cláusula 2');

    // activeScreenContext debe estar completamente VACÍO ({})
    assert.deepEqual(auditContext.activeScreenContext, {});

    // Escenario B: Alertas por defecto de calculadora ("NOTICE: THIS VESSEL IS NOT COMPATIBLE DUE TO EXCESS WEIGHT")
    // nunca deben meterse en fullAuditData.alertas
    assert.ok(!auditContext.fullAuditData.alertas.some(a => a.includes('THIS VESSEL IS NOT COMPATIBLE')));
    assert.ok(!auditContext.fullAuditData.alertas.some(a => a.includes('Faltan datos operativos')));

    // Escenario C: Si el usuario introduce datos reales en la calculadora, activeScreenContext los incluye
    mockElements['#cargo-qty'] = { value: '35000' };
    mockElements['#freight-rate'] = { value: '28.50' };
    assert.equal(hasRealCalculatorData(), true);

    const populatedContext = extractDynamicAuditContext();
    assert.ok(populatedContext.activeScreenContext !== null);
    assert.ok(Object.keys(populatedContext.activeScreenContext).length > 0);

  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWindow;
  }
});

test('2. MarkdownMessage: renderizado de tablas GFM estándar y con variantes de formato', async () => {
  const { MarkdownMessage } = await import('../src/components/GlobalMadreDrawer.jsx');

  // Caso 1: Tabla estándar con barras iniciales y finales y alineaciones
  const standardTable = `
### Auditoría de Cláusulas
| Cláusula / Área | Riesgo detectado | Impacto | Recomendación |
|:---|:---:|---:|:---|
| Cláusula 2 (Freight) | Pago posterior a descarga | Alto | Exigir BBB antes de descarga |
| Cláusula 16 (Demurrage) | Tasa no especificada | Medio | Fijar $12,000/día |
`;

  const html1 = renderToStaticMarkup(React.createElement(MarkdownMessage, { content: standardTable }));
  assert.ok(html1.includes('overflow-x-auto my-2'), 'Debe incluir div con overflow-x-auto my-2');
  assert.ok(html1.includes('<table'), 'Debe renderizar un elemento table');
  assert.ok(html1.includes('<thead'), 'Debe renderizar thead');
  assert.ok(html1.includes('<th'), 'Debe renderizar th');
  assert.ok(html1.includes('Cláusula / Área'), 'Debe incluir cabecera');
  assert.ok(html1.includes('Pago posterior a descarga'), 'Debe incluir celda de contenido');
  assert.ok(html1.includes('Exigir BBB antes de descarga'), 'Debe incluir recomendación');

  // Caso 2: Tabla sin barras iniciales ni finales y separadores con espacios
  const tableWithoutOuterPipes = `
Cláusula / Área | Riesgo detectado | Impacto
---|---|---
Cláusula 7 | Demoras sin notificación | Crítico
Cláusula 10 | Sin laydays claros | Menor
`;

  const html2 = renderToStaticMarkup(React.createElement(MarkdownMessage, { content: tableWithoutOuterPipes }));
  assert.ok(html2.includes('overflow-x-auto my-2'), 'Debe incluir div con overflow-x-auto my-2');
  assert.ok(html2.includes('<table'), 'Debe renderizar tabla');
  assert.ok(html2.includes('Demoras sin notificación'), 'Debe parsear filas de tabla sin barras externas');
  assert.ok(html2.includes('Sin laydays claros'), 'Debe parsear segunda fila');

  // Caso 3: Separadores con espacios como | :--- | :---: |
  const tableWithSpacedSeparators = `
| Campo | Valor |
| :--- | :---: |
| Buque | MV Ocean Glory |
| DWT | 55,000 MT |
`;

  const html3 = renderToStaticMarkup(React.createElement(MarkdownMessage, { content: tableWithSpacedSeparators }));
  assert.ok(html3.includes('MV Ocean Glory'), 'Debe procesar separadores espaciados');
  assert.ok(html3.includes('55,000 MT'), 'Debe procesar filas de datos');
});
