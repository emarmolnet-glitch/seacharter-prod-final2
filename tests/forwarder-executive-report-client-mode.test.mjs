import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

// ============================================================================
// 1. ESTADO DE CONTROL DE EXPORTACIÓN (isClientMode)
// ============================================================================

test('1. ForwarderWorkspace define el estado booleano isClientMode inicializado en false', () => {
  assert.match(
    forwarderComponentSource,
    /const\s*\[isClientMode,\s*setIsClientMode\]\s*=\s*useState\(false\);/,
    'Debe declarar const [isClientMode, setIsClientMode] = useState(false)'
  );
});

// ============================================================================
// 2. CONTROLES DE UI: TOGGLE Y BOTONES DE EXPORTACIÓN
// ============================================================================

test('2. UI incluye botones/toggle para "Imprimir Reporte Interno" vs "Imprimir Reporte Cliente"', () => {
  // Botones de impresión dedicados en barra flotante
  assert.match(
    forwarderComponentSource,
    /id="btn-print-internal-report"/,
    'Debe existir el botón btn-print-internal-report'
  );
  assert.match(
    forwarderComponentSource,
    /id="btn-print-client-report"/,
    'Debe existir el botón btn-print-client-report'
  );
  assert.match(forwarderComponentSource, /Imprimir Reporte Interno/);
  assert.match(forwarderComponentSource, /Imprimir Reporte Cliente/);

  // Toggle interactivo en cabecera del documento imprimible
  assert.match(
    forwarderComponentSource,
    /id="report-mode-toggle-group"/,
    'Debe existir el grupo de toggle de modo de reporte'
  );
  assert.match(
    forwarderComponentSource,
    /id="btn-toggle-internal-mode"[\s\S]*?onClick=\{\(\)\s*=>\s*setIsClientMode\(false\)\}/,
    'Toggle interno debe fijar isClientMode en false'
  );
  assert.match(
    forwarderComponentSource,
    /id="btn-toggle-client-mode"[\s\S]*?onClick=\{\(\)\s*=>\s*setIsClientMode\(true\)\}/,
    'Toggle cliente debe fijar isClientMode en true'
  );
});

// ============================================================================
// 3. TABLA "DESGLOSE FINANCIERO SEPARADO": OCULTACIÓN DE COSTE Y MARGEN
// ============================================================================

test('3. Tabla "DESGLOSE FINANCIERO SEPARADO" oculta columnas Coste ($) y Margen en Modo Cliente', () => {
  // Cabecera de la tabla
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<th[^>]*>\s*Coste\s*\(\$\)\s*<\/th>\s*\)\}/,
    'La columna Coste ($) debe estar condicionada por !isClientMode'
  );
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<th[^>]*>\s*Margen\s*<\/th>\s*\)\}/,
    'La columna Margen debe estar condicionada por !isClientMode'
  );

  // Columnas siempre visibles para cliente: Concepto, Descripción y Venta ($)
  assert.match(forwarderComponentSource, /<th[^>]*>\s*Concepto\s*<\/th>/);
  assert.match(forwarderComponentSource, /<th[^>]*>\s*Descripción\s*<\/th>/);
  assert.match(forwarderComponentSource, /<th[^>]*title="Venta \(€\)"[^>]*>\s*Venta\s*\(\$\)\s*<\/th>/);
});

test('4. Celdas <td> de Coste y Margen están condicionadas por !isClientMode en todas las filas', () => {
  // Escenario All-In
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<td[^>]*>\s*\{formatCurrency\(finalTotalCost\)\}\s*<\/td>\s*\)\}/
  );
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<td[^>]*>\s*\{formatCurrency\(finalTotalMargin\)\}\s*<\/td>\s*\)\}/
  );

  // Flete Marítimo (Base RT)
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<td[^>]*>\s*\{formatCurrency\(fleteCostNum\)\}\s*<\/td>\s*\)\}/
  );

  // Subtotales destacados
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<span[^>]*>\s*Precio Venta Flete:/
  );
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<span[^>]*>\s*Precio Venta Operativa:/
  );
});

// ============================================================================
// 4. BLOQUE "DESGLOSE UNITARIO OPERATIVO": OCULTACIÓN DE COMPRA Y COSTES FOB
// ============================================================================

test('5. Bloque "DESGLOSE UNITARIO OPERATIVO" oculta Flete Sugerido Armador (Compra) y Costes FOB + Mercancía en Modo Cliente', () => {
  // Flete Sugerido Armador (Compra) condicionado por !isClientMode
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*Number\(activeReport\.fleteCompraUnit\s*\|\|\s*0\)\s*>\s*0\s*&&\s*\([\s\S]*?Flete Sugerido Armador \(Compra\)[\s\S]*?<\/div>\s*\)\}/
  );

  // Costes FOB + Mercancía condicionado por !isClientMode
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\([\s\S]*?Costes FOB \+ Mercancía[\s\S]*?fobMasMercanciaUnitarioUsdMt[\s\S]*?<\/div>\s*\)\}/
  );

  // Tarjetas de venta permanecen incondicionales cuando existen datos
  assert.match(forwarderComponentSource, /Flete Sugerido Fletador \(Venta\)/);
  assert.match(forwarderComponentSource, /Valor del Flete/);
  assert.match(forwarderComponentSource, /fleteUnitarioUsdMt/);
});

// ============================================================================
// 5. BLOQUE "PRECIO TOTAL DE VENTA AL CLIENTE": OCULTACIÓN DE TEXTO INFERIOR
// ============================================================================

test('6. Bloque "PRECIO TOTAL DE VENTA AL CLIENTE" mantiene el total y oculta Coste All-In y Margen en Modo Cliente', () => {
  // Total principal siempre visible
  assert.match(
    forwarderComponentSource,
    /<div className="text-4xl font-black font-mono text-blue-700">\{formatCurrency\(finalTotalSale\)\}<\/div>/
  );

  // Texto inferior que revela el coste y margen condicionado por !isClientMode
  assert.match(
    forwarderComponentSource,
    /\{!isClientMode\s*&&\s*\(\s*<div className="text-xs text-slate-500 mt-1 font-bold">Coste All-In: \{formatCurrency\(finalTotalCost\)\} · Margen comercial \(\{formatCurrency\(finalTotalMargin\)\}\)<\/div>\s*\)\}/
  );
});

// ============================================================================
// 6. SECCIÓN TÉCNICA 100% INTACTA
// ============================================================================

test('7. Croquis Esquemático, VisualStowagePlan y Razonamiento Técnico permanecen 100% visibles', () => {
  // Croquis Esquemático de Estiba
  assert.match(forwarderComponentSource, /🚢\s*<\/span>\s*Croquis Esquemático de Estiba \(Stowage Plan\)/);

  // Componente VisualStowagePlan
  assert.match(
    forwarderComponentSource,
    /<VisualStowagePlan[\s\S]*?stowagePlan=\{[\s\S]*?vesselType=\{[\s\S]*?projectRef=\{/,
    '<VisualStowagePlan /> debe renderizarse sin depender de isClientMode'
  );

  // Razonamiento Técnico de Ingeniería Naval
  assert.match(
    forwarderComponentSource,
    /Razonamiento Técnico de Ingeniería Naval/,
    'El Razonamiento Técnico debe renderizarse sin depender de isClientMode'
  );
});
