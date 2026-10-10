import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const panelCode = fs.readFileSync(path.join(rootDir, 'src/components/QuickQuotePanel.jsx'), 'utf-8');

test('1. Estado isCheckingOut en QuickQuotePanel.jsx', () => {
  assert.match(
    panelCode,
    /const\s+\[isCheckingOut,\s*setIsCheckingOut\]\s*=\s*useState\(false\);/,
    'Debe definir el estado [isCheckingOut, setIsCheckingOut] inicializado en false'
  );
});

test('2. Callback handleCheckout con useCallback, simulación de 1s y alert', () => {
  assert.match(
    panelCode,
    /const\s+handleCheckout\s*=\s*useCallback\(/,
    'Debe implementar handleCheckout con useCallback'
  );
  assert.match(
    panelCode,
    /setIsCheckingOut\(true\)/,
    'handleCheckout debe activar isCheckingOut a true'
  );
  assert.match(
    panelCode,
    /setTimeout\(/,
    'handleCheckout debe utilizar setTimeout para simular retraso'
  );
  assert.match(
    panelCode,
    /1000\s*\)/,
    'handleCheckout debe usar un retraso de 1 segundo (1000ms)'
  );
  assert.match(
    panelCode,
    /alert\(["']Iniciando conexión con pasarela de pago segura\.\.\. \(Proveedor de pagos pendiente de integración\)["']\)/,
    'handleCheckout debe mostrar el alert con el texto exacto requerido'
  );
  assert.match(
    panelCode,
    /setIsCheckingOut\(false\)/,
    'handleCheckout debe devolver isCheckingOut a false tras el timeout'
  );
});

test('3. Botón de Checkout en JSX: Ubicación, estilos y estados', () => {
  // Debe existir en el contenedor de acciones secundarias justo antes de fcl-export-client-pdf-btn
  const actionsContainerMatch = panelCode.match(
    /<div className="flex flex-col gap-2 w-full pt-1">([\s\S]*?)<\/div>/
  );
  assert.ok(actionsContainerMatch, 'Debe existir el contenedor <div className="flex flex-col gap-2 w-full pt-1">');

  const containerContent = actionsContainerMatch[1];
  assert.match(
    containerContent,
    /Confirmar Booking y Pagar/,
    'Debe contener el texto del botón Confirmar Booking y Pagar'
  );

  // Verificación de orden: el botón de checkout debe aparecer antes del botón PDF
  const checkoutIndex = containerContent.indexOf('Confirmar Booking y Pagar');
  const pdfIndex = containerContent.indexOf('id="fcl-export-client-pdf-btn"');
  const syncIndex = containerContent.indexOf('id="btn-sync-databridge-quote"');

  assert.ok(checkoutIndex !== -1, 'El botón de checkout debe estar en el contenedor');
  assert.ok(pdfIndex !== -1, 'El botón PDF debe estar en el contenedor');
  assert.ok(syncIndex !== -1, 'El botón Data Bridge debe estar en el contenedor');
  assert.ok(checkoutIndex < pdfIndex, 'El botón de checkout debe estar encima del botón de PDF');
  assert.ok(pdfIndex < syncIndex, 'El botón de PDF debe estar antes del botón de Data Bridge');

  // Diseño visual Tailwind
  assert.match(
    containerContent,
    /bg-emerald-600\s+hover:bg-emerald-700\s+text-white/,
    'Debe incluir los estilos Tailwind corporativos verdes bg-emerald-600 hover:bg-emerald-700 text-white'
  );
  assert.match(
    containerContent,
    /font-bold/,
    'Debe tener texto en negrita'
  );
  assert.match(
    containerContent,
    /rounded-lg/,
    'Debe tener bordes redondeados'
  );
  assert.match(
    containerContent,
    /fa-credit-card|fa-lock/,
    'Debe incluir un icono representativo fa-credit-card o fa-lock'
  );

  // Lógica de bloqueo
  assert.match(
    containerContent,
    /disabled=\{consolidatedTotal === 0 \|\| consolidatedTotal === null \|\| isCheckingOut\}/,
    'El botón debe deshabilitarse si consolidatedTotal es 0 o null, o si isCheckingOut es true'
  );

  // Estado de procesamiento
  assert.match(
    containerContent,
    /Procesando\.\.\./,
    'Debe mostrar el texto "Procesando..." mientras isCheckingOut sea true'
  );
});
