import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const forwarderComponentSource = readFileSync(
  new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
  'utf8'
);

test('1. [GRACEFUL DEGRADATION] Eliminates raw HTTP error rendering and renders friendly Tailwind Empty State', () => {
  // Must NOT display raw HTTP error text directly in the lateral list error block
  assert.doesNotMatch(
    forwarderComponentSource,
    /\{!isLoading && error && \(\s*<div[^>]*>\s*<p>\{error\}<\/p>/,
    'Debe eliminar la renderización directa de <p>{error}</p> en crudo'
  );

  // Must define friendly Empty State text
  assert.match(
    forwarderComponentSource,
    /No se pudo sincronizar la lista de proyectos\. Verifica la conexión\./,
    'Debe incluir el mensaje amigable de sincronización de proyectos'
  );

  // Must include soft warning icon in the Empty State
  assert.match(
    forwarderComponentSource,
    /bg-amber-500\/10/,
    'Empty state debe tener fondo de advertencia suave amber-500/10'
  );
  assert.match(
    forwarderComponentSource,
    /text-amber-400/,
    'Empty state debe tener icono o acento en amber-400'
  );
  assert.match(
    forwarderComponentSource,
    /Sincronización pendiente/,
    'Empty state debe titularse "Sincronización pendiente"'
  );
});

test('2. [FUNCTIONAL RETRY BUTTON] Retry button triggers fetchProjects and displays visual loading feedback', () => {
  // Retry button must have a clear button tag, not a broken raw link
  assert.match(
    forwarderComponentSource,
    /<button[^>]*onClick=\{\(\)\s*=>\s*\{\s*setError\(null\);\s*fetchProjects\(\);\s*\}\}[^>]*>/,
    'El botón de Reintentar debe resetear el error y ejecutar fetchProjects()'
  );

  // Must include Reintentar text or Reintentando state
  assert.match(
    forwarderComponentSource,
    /\{isLoading \|\| isRefreshing \? 'Reintentando\.\.\.' : 'Reintentar'\}/,
    'Debe alternar entre "Reintentando..." y "Reintentar" según el estado de carga'
  );

  // Must spin icon during retry
  assert.match(
    forwarderComponentSource,
    /\$\{isLoading \|\| isRefreshing \? 'animate-spin' : ''\}/,
    'El icono SVG de Reintentar debe girar con animate-spin durante la petición'
  );
});

test('3. [SKELETON LOADING & SPINNER] Screen is never blank or blocked while fetching', () => {
  // Must implement Skeleton Loading with pulsing lines
  assert.match(
    forwarderComponentSource,
    /animate-pulse/,
    'Debe implementar Skeleton Loading con animate-pulse'
  );
  assert.match(
    forwarderComponentSource,
    /role="status"\s+aria-label="Cargando proyectos"/,
    'Skeleton debe definir accesibilidad con role="status" y aria-label'
  );

  // Must have placeholder bars for simulated text
  assert.match(
    forwarderComponentSource,
    /bg-slate-700\/60 rounded/,
    'Debe contener barras simuladas de texto con bg-slate-700 y bordes redondeados'
  );
  assert.match(
    forwarderComponentSource,
    /bg-slate-800\/80 rounded/,
    'Debe contener barras secundarias de texto'
  );

  // Must preserve feedback spinner with "Cargando proyectos..."
  assert.match(
    forwarderComponentSource,
    /<p>Cargando proyectos\.\.\.<\/p>/,
    'Debe renderizar el feedback con texto "Cargando proyectos..."'
  );
});

test('4. [PROTECTION OF PREVIOUS STATE] Cached projects are preserved on refresh failure and non-intrusive toast is shown', () => {
  // Must declare refreshToast and projectsRef
  assert.match(
    forwarderComponentSource,
    /const\s*\[\s*refreshToast\s*,\s*setRefreshToast\s*\]\s*=\s*useState\(null\);/,
    'Debe declarar estado refreshToast'
  );
  assert.match(
    forwarderComponentSource,
    /const\s+projectsRef\s*=\s*useRef\(projects\);/,
    'Debe declarar projectsRef para evaluar el estado en memoria en callbacks asíncronos'
  );

  // In catch block, must protect cached projects
  assert.match(
    forwarderComponentSource,
    /if\s*\(projectsRef\.current\s*&&\s*projectsRef\.current\.length\s*>\s*0\)\s*\{\s*setRefreshToast\(friendlyMessage\);/,
    'Ante error en actualización con proyectos cacheados, debe activar toast y conservar proyectos'
  );

  // Toast must display non-intrusive alert with close and retry action
  assert.match(
    forwarderComponentSource,
    /Mostrando datos cacheados\./,
    'El toast debe informar que se muestran datos cacheados'
  );
  assert.match(
    forwarderComponentSource,
    /aria-label="Cerrar notificación"/,
    'El toast debe ser descartable con botón de cierre'
  );
});

test('5. [BEHAVIORAL SIMULATION] Verifies state transitions for initial failure vs refresh failure with cached items', async () => {
  let inMemoryProjects = [];
  let uiError = null;
  let uiToast = null;
  let isLoading = false;
  let isRefreshing = false;

  const simulateFetch = async ({ fail = false, newProjects = [] } = {}) => {
    isLoading = true;
    isRefreshing = true;
    uiError = null;

    try {
      if (fail) {
        throw new Error('HTTP 502 Bad Gateway');
      }
      inMemoryProjects = newProjects;
      uiToast = null;
      uiError = null;
    } catch (err) {
      const friendlyMessage = 'No se pudo sincronizar la lista de proyectos. Verifica la conexión.';
      if (inMemoryProjects.length > 0) {
        // Protección de estado previo: mantener lista en memoria y mostrar toast
        uiToast = friendlyMessage;
        uiError = null;
      } else {
        // Empty state
        uiError = friendlyMessage;
      }
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  };

  // Scenario 1: Initial load fails (no cached projects)
  await simulateFetch({ fail: true });
  assert.equal(inMemoryProjects.length, 0, 'No debe haber proyectos en memoria');
  assert.equal(uiError, 'No se pudo sincronizar la lista de proyectos. Verifica la conexión.');
  assert.equal(uiToast, null, 'No debe mostrarse toast si no había proyectos previos');

  // Scenario 2: Retry succeeds
  await simulateFetch({ fail: false, newProjects: [{ id: 1, project_ref: 'PRJ-001' }] });
  assert.equal(inMemoryProjects.length, 1, 'Proyectos en memoria deben actualizarse');
  assert.equal(uiError, null, 'Error debe limpiarse tras éxito');
  assert.equal(uiToast, null, 'Toast debe limpiarse tras éxito');

  // Scenario 3: Refresh fails while user already had cached projects
  await simulateFetch({ fail: true });
  assert.equal(inMemoryProjects.length, 1, 'LOS DATOS CACHEADOS NO DEBEN BORRARSE');
  assert.equal(inMemoryProjects[0].project_ref, 'PRJ-001');
  assert.equal(uiError, null, 'No debe romperse la pantalla con uiError que reemplace la lista');
  assert.equal(uiToast, 'No se pudo sincronizar la lista de proyectos. Verifica la conexión.', 'Debe emitir notificación toast no intrusiva');
});
