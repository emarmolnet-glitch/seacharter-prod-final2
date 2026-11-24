import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markdownToOutlookHtml,
  markdownToPlainText,
  extractCounterproposalEmail,
} from '../src/utils/madreReportClipboard.mjs';

const REPORT = `## 1. Veredicto general
🟡 Flete ajustado. Break-even \`42.10 USD/MT\`.

### 2. Tabla comparativa
| Concepto | Oferta | Opción B |
| --- | :---: | ---: |
| **Flete** | \`40.00\` | \`45.50\` |
| Load rate | 8,000 MT/d | 10,000 MT/d |

## 3. Recomendaciones
- Subir flete a **45.50 USD/MT**
- Ajustar demoras

## 4. Correo de contrapropuesta
**Uso interno:** margen objetivo 7,5 % sobre break-even 42.10 USD/MT.

**Asunto:** Contrapropuesta flete — MV Ocean Star (Santos → Rotterdam)

Estimados señores,

Gracias por su oferta. Proponemos un flete de \`45.50 USD/MT\` con load rate de 10,000 MT/día.

Nota interna: break-even 42.10, margen 8 %.

Quedamos atentos a su confirmación.

Atentamente,
Equipo de Fletamentos
Rodahmar

### Notas internas
Margen neto estimado 8 %.

## 5. Próximos pasos
- Seguimiento en 24 h
`;

test('HTML Outlook usa solo estilos inline y sin marcadores crudos', () => {
  const html = markdownToOutlookHtml(REPORT);
  assert.ok(!/class=/.test(html));
  assert.ok(!html.includes('###'));
  assert.ok(!html.includes('**'));
  assert.ok(!html.includes('`'));
  assert.ok(!/\|\s*-{3}/.test(html));
  assert.match(html, /font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b;/);
  assert.match(html, /<th style="[^"]*background: #0f2942;[^"]*color: #ffffff/);
  assert.match(html, /<td style="[^"]*padding: 8px 10px; border: 1px solid #cbd5e1;/);
  assert.match(html, /#f8fafc/);
  assert.match(html, /<h2 style="[^"]*color: #0f2942;[^"]*border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;/);
  assert.match(html, /<span style="font-weight:600; color:#0f2942; background:#f1f5f9; padding:1px 4px; border-radius:3px;">45.50<\/span>/);
});

test('texto plano limpio', () => {
  const plain = markdownToPlainText(REPORT);
  for (const bad of ['###', '##', '**', '`', '| ---', '---:']) assert.ok(!plain.includes(bad), bad);
  assert.match(plain, /Flete {2}· {2}40.00 {2}· {2}45.50/);
});

test('correo de contrapropuesta: solo Asunto→firma y sin bloques internos', () => {
  const email = extractCounterproposalEmail(REPORT);
  assert.ok(email.startsWith('**Asunto:**'));
  assert.ok(email.includes('Estimados señores'));
  assert.ok(email.includes('45.50 USD/MT'));
  assert.ok(email.trim().endsWith('Rodahmar'));
  assert.ok(!/interno|break-even|margen/i.test(email), email);
  assert.ok(!email.includes('Próximos pasos'));
  const html = markdownToOutlookHtml(email);
  assert.ok(!html.includes('**'));
});

test('sin correo → null', () => {
  assert.equal(extractCounterproposalEmail('## 1. Veredicto\nTodo correcto.'), null);
});
