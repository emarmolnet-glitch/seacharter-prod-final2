import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(
  new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
  'utf8'
);

test('1. ForwarderWorkspace implementa ForwarderWorkspaceErrorBoundary para evitar pantalla en blanco', () => {
  assert.match(
    workspaceSource,
    /class\s+ForwarderWorkspaceErrorBoundary\s+extends\s+React\.Component/,
    'Debe definir un ErrorBoundary específico para la vista de proyectos'
  );
  assert.match(
    workspaceSource,
    /static\s+getDerivedStateFromError/,
    'ErrorBoundary debe capturar errores mediante getDerivedStateFromError'
  );
  assert.match(
    workspaceSource,
    /componentDidCatch/,
    'ErrorBoundary debe registrar errores en componentDidCatch'
  );
  assert.match(
    workspaceSource,
    /export\s+default\s+SafeForwarderWorkspace;/,
    'El componente principal exportado por defecto debe ser SafeForwarderWorkspace'
  );
});

test('2. La lista lateral de proyectos maneja estados de carga, error y lista vacía sin romper el render', () => {
  assert.match(workspaceSource, /\{isLoading && \(/);
  assert.match(workspaceSource, /Cargando proyectos\.\.\./);
  assert.match(workspaceSource, /\{!isLoading && error && \(/);
  assert.match(workspaceSource, /\{!isLoading && !error && projects\.length === 0 && \(/);
  assert.match(workspaceSource, /projects\.map\(\(proj\) => \{/);
});

test('3. El renderizado del expediente y los servicios maneja fallbacks seguros para arrays nulos o vacíos', () => {
  assert.match(
    workspaceSource,
    /const projectItemsList = Array\.isArray\(activeProject\.line_items\)\s*\?\s*activeProject\.line_items/
  );
  assert.match(
    workspaceSource,
    /activeProject\?\.client_name \|\| 'Expediente Sin Nombre'/
  );
  assert.match(
    workspaceSource,
    /activeProject\?\.project_ref \|\| 'RDM\/2026-001'/
  );
});

test('4. El mapeo de bodegas en stowagePlan verifica Array.isArray para prevenir excepciones', () => {
  assert.match(
    workspaceSource,
    /\(Array\.isArray\(activeReport\.stowagePlan\.holds\)\s*\?\s*activeReport\.stowagePlan\.holds\s*:\s*\[\]\)\.map/
  );
});

test('5. La función handleSyncCalculatorData utiliza una referencia mutable estable para evitar bucles o re-renders', () => {
  assert.match(
    workspaceSource,
    /const handleSyncCalculatorDataRef = useRef\(null\);/
  );
  assert.match(
    workspaceSource,
    /handleSyncCalculatorDataRef\.current = handleSyncCalculatorData;/
  );
  assert.match(
    workspaceSource,
    /window\.handleSyncCalculatorData = \(\.\.\.args\) => handleSyncCalculatorDataRef\.current\?\.\(\.\.\.args\);/
  );
});
