import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const forwarderProjectsSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');
const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');

test('1. [NEON 502/503 RESILIENCE] forwarder-projects.js uses safe query execution with client release and acquire timeouts', () => {
  assert.match(forwarderProjectsSource, /executeSafeQuery/, 'Debe existir función executeSafeQuery');
  assert.match(forwarderProjectsSource, /client\.release\(\)/, 'Debe liberar el cliente tras cada consulta');
  assert.match(forwarderProjectsSource, /connectionTimeoutMillis:\s*5000/, 'Debe configurar timeout de conexión de 5000ms');
  assert.match(forwarderProjectsSource, /isTimeout\s*\|\|\s*isNetworkOrDbUnavailable/, 'Debe clasificar timeouts e indisponibilidad de Neon');
  assert.match(forwarderProjectsSource, /statusCode\s*=\s*\(isTimeout\s*\|\|\s*isNetworkOrDbUnavailable\)\s*\?\s*503\s*:\s*500/, 'Debe devolver 503 estructurado en timeout/red en lugar de 502 bruto');
  assert.match(forwarderProjectsSource, /'Retry-After':\s*'5'/, 'Debe incluir cabecera Retry-After');
});

test('2. [NEON ERROR HANDLER SIMULATION] handler devuelve respuesta JSON estructurada y código 503 ante fallos de conexión', async () => {
  // Crear un sandbox aislado para probar el handler simulando caída de Neon
  const mockExports = {};
  const mockModule = { exports: mockExports };
  const mockProcess = {
    env: { DATABASE_URL: 'postgres://user:pass@ep-fake-neon.eu-central-1.neon.tech/neondb' }
  };

  // Mock de pg que rechaza la conexión por timeout
  const mockPg = {
    Pool: class {
      constructor() {}
      on() {}
      async connect() {
        const timeoutErr = new Error('Connection terminated due to connection timeout');
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      }
      async query() {
        throw new Error('Connection terminated');
      }
    }
  };

  const sandbox = {
    require: (mod) => {
      if (mod === 'pg') return mockPg;
      return {};
    },
    process: mockProcess,
    module: mockModule,
    exports: mockExports,
    console,
    Date
  };

  vm.runInNewContext(forwarderProjectsSource, sandbox);
  const { handler } = mockModule.exports;

  const response = await handler({ httpMethod: 'GET', queryStringParameters: {} });
  assert.equal(response.statusCode, 503, 'Debe responder con 503 ante caída o timeout de Neon');
  assert.match(response.headers['Content-Type'], /application\/json/);
  assert.equal(response.headers['Retry-After'], '5');

  const parsedBody = JSON.parse(response.body);
  assert.equal(parsedBody.success, false);
  assert.equal(parsedBody.code, 'DB_TIMEOUT');
  assert.match(parsedBody.error, /Tiempo de espera agotado al conectar con la base de datos Neon/);
});

test('3. [WEBGL STRICT VALIDATION] GlobalFleetGlobe valida compatibilidad antes de instanciar y cuenta con fallback UI', () => {
  assert.match(globeSource, /function\s+isWebGLSupported\(\)/, 'Debe definir isWebGLSupported()');
  assert.match(globeSource, /createWebGlFallbackUI/, 'Debe definir createWebGlFallbackUI()');
  assert.match(globeSource, /if\s*\(!isWebGLSupported\(\)\)/, 'Debe comprobar isWebGLSupported() antes de montar el globo');
  assert.match(globeSource, /createFallbackAdapter/, 'Debe devolver un adapter seguro para no romper la app');
});

test('4. [WEBGL CONTEXT LOSS & RECOVERY] GlobalFleetGlobe escucha webglcontextlost y webglcontextrestored', () => {
  assert.match(globeSource, /webglcontextlost/, 'Debe registrar listener para webglcontextlost');
  assert.match(globeSource, /webglcontextrestored/, 'Debe registrar listener para webglcontextrestored');
  assert.match(globeSource, /event\?\.preventDefault\?\.\(\)/, 'Debe prevenir la recarga forzosa en webglcontextlost');
  assert.match(globeSource, /canvasElement\.removeEventListener\('webglcontextlost'/, 'Debe desvincular el evento en destroy()');
});

test('5. [WEBGL UNAVAILABLE FALLBACK UI MOUNT] Si WebGL no está soportado, se renderiza el fallback UI sin lanzar excepciones', () => {
  let createdChildren = [];
  const container = {
    id: 'ais-map',
    classList: { add() {} },
    style: {},
    dataset: {},
    clientWidth: 800,
    clientHeight: 600,
    parentElement: null,
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    getClientRects: () => [{ width: 800, height: 600 }],
    replaceChildren() { createdChildren = []; },
    appendChild(child) { createdChildren.push(child); },
    addEventListener() {},
    removeEventListener() {},
  };

  const documentMock = {
    getElementById: (id) => (id === 'ais-map' ? container : null),
    createElement: (tag) => {
      if (tag === 'canvas') {
        // Simular ausencia total de WebGL en el navegador
        return {
          getContext: () => null,
          style: {}
        };
      }
      return {
        tagName: tag.toUpperCase(),
        classList: { add() {} },
        style: {},
        dataset: {},
        setAttribute() {},
        appendChild(el) { createdChildren.push(el); }
      };
    }
  };

  const windowMock = {
    addEventListener() {},
    setTimeout,
    clearTimeout,
    Globe: () => () => ({})
  };

  vm.runInNewContext(globeSource, {
    window: windowMock,
    document: documentMock,
    console,
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame() {}
  });

  const adapter = windowMock.GlobalFleetGlobe.mount({
    containerId: 'ais-map',
    key: 'density'
  });

  assert.ok(adapter, 'Debe retornar un adapter de respaldo sin crashear');
  assert.equal(adapter.isFallback, true, 'El adapter debe marcarse como fallback');
  assert.equal(container.dataset.renderKey, 'fallback-no-webgl', 'El contenedor debe reflejar fallback-no-webgl');
  assert.ok(createdChildren.length > 0, 'Debe haber insertado los elementos del fallback UI');
});
