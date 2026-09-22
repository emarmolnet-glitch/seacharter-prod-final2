import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sidebarSource = readFileSync(new URL('../src/components/ProviderTariffSidebar.jsx', import.meta.url), 'utf8');
const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. ELIMINAR CAMPOS HARDCODEADOS: array dinámico de tarifas y renderizado de inputs por concepto', () => {
  // Debe existir estado de array dinámico de tarifas
  assert.match(
    sidebarSource,
    /const\s+\[tarifas,\s*setTarifas\]\s*=\s*useState\(/,
    'Debe definir el estado dinámico tarifas con useState'
  );

  // La interfaz debe renderizar un input por cada elemento del array permitiendo cambiar el concepto
  assert.match(
    sidebarSource,
    /handleTarifaConceptoChange/,
    'Debe existir función manejadora para editar el nombre del concepto'
  );

  assert.match(
    sidebarSource,
    /handleTarifaValorChange/,
    'Debe existir función manejadora para editar el valor local'
  );

  assert.match(
    sidebarSource,
    /tarifasConUsd\.map/,
    'Debe iterar y renderizar las tarifas dinámicas en la interfaz'
  );
});

test('2. SELECTOR DE DIVISA Y TIPO DE CAMBIO DINÁMICO', () => {
  // Estados para divisa y exchangeRateToUsd
  assert.match(
    sidebarSource,
    /const\s+\[currency,\s*setCurrency\]\s*=\s*useState\(/,
    'Debe tener estado para la divisa origen currency'
  );
  assert.match(
    sidebarSource,
    /const\s+\[exchangeRateToUsd,\s*setExchangeRateToUsd\]\s*=\s*useState\(/,
    'Debe tener estado para exchangeRateToUsd'
  );

  // Dropdown selector en la interfaz
  assert.match(
    sidebarSource,
    /id="pt-currency-select"/,
    'Debe incluir selector de moneda pt-currency-select'
  );
  assert.match(
    sidebarSource,
    /id="pt-exchange-rate-input"/,
    'Debe incluir input para el tipo de cambio pt-exchange-rate-input'
  );

  // Conversión dinámica de cada fila dependiendo de exchangeRateToUsd
  assert.match(
    sidebarSource,
    /exchangeRateToUsd/,
    'El cálculo de conversión a USD debe depender de exchangeRateToUsd'
  );
});

test('3. FUNCIONALIDAD DEL BOTÓN "ENVIAR AL PROYECTO" E INYECCIÓN', () => {
  // El botón inferior recoge el total de mercancía e inyecta { mercancia_usd: totalCalculado }
  assert.match(
    sidebarSource,
    /mercancia_usd:\s*totalMercanciaUsd/,
    'Debe incluir mercancia_usd con el total calculado'
  );

  // Invoca updatePayload o setGlobalState
  assert.match(
    sidebarSource,
    /window\.updatePayload|window\.setGlobalState/,
    'Debe actualizar el estado global del proyecto con updatePayload o setGlobalState'
  );

  // Cierra automáticamente la barra lateral (setSidebarOpen(false) o setIsOpen(false))
  assert.match(
    sidebarSource,
    /setSidebarOpen\(false\);/,
    'Debe cerrar la barra lateral invocando setSidebarOpen(false)'
  );

  // ForwarderWorkspace expone window.updatePayload y maneja mercancia_usd
  assert.match(
    forwarderSource,
    /window\.updatePayload\s*=\s*handleApplyProjectPayload/,
    'ForwarderWorkspace debe exponer window.updatePayload'
  );
  assert.match(
    forwarderSource,
    /payload\.mercancia_usd/,
    'ForwarderWorkspace debe recibir e inyectar payload.mercancia_usd'
  );
});
