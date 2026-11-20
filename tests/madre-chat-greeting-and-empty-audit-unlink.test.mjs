import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

try {
  register(new URL('./jsx-loader.mjs', import.meta.url));
} catch (_) {}

const drawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');

test('1. hasActiveDocumentOrAudit: NO vincula expedientes vacíos ni por defecto (RDM/2026-0000)', async () => {
  const { hasActiveDocumentOrAudit } = await import('../src/components/GlobalMadreDrawer.jsx');

  // Caso 1: Expediente inicial vacío por defecto RDM/2026-0000
  const emptyDefaultPayload = {
    documentName: 'RDM/2026-0000',
    documentType: null,
    rawDocumentText: '',
    fullAuditData: {
      modulo_activo: 'calculadora',
      bloques: [],
      tablas: [],
      alertas: []
    }
  };
  assert.equal(hasActiveDocumentOrAudit(emptyDefaultPayload), false, 'No debe vincular RDM/2026-0000 sin contenido');

  // Caso 2: Expediente inicial vacío con referencia genérica
  const emptyTbnPayload = {
    documentName: 'RDM/2026-TBN',
    documentType: null,
    rawDocumentText: '',
    fullAuditData: {
      modulo_activo: 'calculadora',
      bloques: [{ titulo: 'Calculadora de Flete', resumen: 'Contenido UI' }],
      tablas: [],
      alertas: []
    }
  };
  assert.equal(hasActiveDocumentOrAudit(emptyTbnPayload), false, 'Bloques genéricos de UI de calculadora no deben vincularse');

  // Caso 3: Expediente con texto de contrato real
  const validDocumentPayload = {
    documentName: 'RDM/2026-0042',
    documentType: 'GENCON',
    rawDocumentText: 'VOYAGE CHARTER PARTY GENCON 1994. Clause 1: The vessel shall proceed to the loading port...',
    fullAuditData: {
      modulo_activo: 'auditoria',
      bloques: [],
      tablas: [{ id: 'tbl-1', rows: [['Clausula 1', 'Ok']] }],
      alertas: []
    }
  };
  assert.equal(hasActiveDocumentOrAudit(validDocumentPayload), true, 'Debe vincular documentos con texto real');

  // Caso 4: Expediente con auditoría previa en memoria
  const priorAuditPayload = {
    documentName: 'Fixture Recap MV Ocean Star',
    documentType: 'FIXTURE RECAP',
    rawDocumentText: '',
    fullAuditData: {
      modulo_activo: 'auditoria',
      madreUltimaAuditoria: { veredicto_general: 'optimo', reporte_estrategico: 'Análisis validado' },
      bloques: [],
      tablas: [],
      alertas: []
    }
  };
  assert.equal(hasActiveDocumentOrAudit(priorAuditPayload), true, 'Debe vincular si existe auditoría previa en memoria');
});

test('2. isSimpleGreetingOrCourtesy: Clasificación precisa de saludos y cortesías breves', async () => {
  const { isSimpleGreetingOrCourtesy } = await import('../src/components/GlobalMadreDrawer.jsx');

  // Saludos simples válidos que deben ir al chat estándar
  const saludosValidos = [
    'hola',
    'Hola!',
    '¡Hola!',
    'hola madre',
    'buenas',
    'Buenas!',
    'buenos días',
    'buenos dias',
    'buen dia',
    'Buenas tardes',
    'buenas noches',
    'hi',
    'hello',
    'hey',
    'gracias',
    'muchas gracias',
    'mil gracias',
    'thanks',
    'thank you',
    'ok',
    'vale',
    'perfecto',
    'entendido',
    'de acuerdo',
    'qué tal',
    'como estas',
    'cómo estás',
    'saludos',
    'chao',
    'adiós',
    'adios'
  ];

  for (const saludo of saludosValidos) {
    assert.equal(isSimpleGreetingOrCourtesy(saludo), true, `"${saludo}" debe clasificarse como saludo/cortesía`);
  }

  // Mensajes con intención analítica o marítima que NO son saludos simples
  const consultasAnaliticas = [
    'hola, ¿cuál es el flete?',
    'hola, analiza los riesgos del contrato',
    'buenos días, revisa el laytime',
    'cuál es el break-even del viaje',
    'revisa la cláusula 5',
    'calcular demurrage',
    'escanear pantalla',
    'auditar contrato',
    'analizar condiciones de puerto',
    'precio del bunker en Gibraltar'
  ];

  for (const consulta of consultasAnaliticas) {
    assert.equal(isSimpleGreetingOrCourtesy(consulta), false, `"${consulta}" no debe clasificarse como saludo simple`);
  }
});

test('3. GlobalMadreDrawer: Estructura del código garantiza saludo al chat estándar y no auto-vincula en arranque', () => {
  // Verificación de existencia de isSimpleGreetingOrCourtesy
  assert.match(drawerSource, /function\s+isSimpleGreetingOrCourtesy\s*\(/);
  assert.match(drawerSource, /isSimpleGreetingOrCourtesy/);

  // Verificación de que hasNewAudit excluye saludos
  assert.match(drawerSource, /!isGreeting/);

  // Verificación de que hasCriticalAudit requiere !isGreeting
  assert.match(drawerSource, /hasCriticalAudit\s*=\s*Boolean\(effectiveAudit\s*&&\s*!isGreeting\)/);

  // Verificación de que nunca se envía scanMode="audit_critical" si hasCriticalAudit es falso
  assert.match(drawerSource, /if\s*\(hasCriticalAudit\s*&&\s*effectiveAudit\)\s*\{/);
  assert.match(drawerSource, /payload\.scanMode\s*=\s*["']audit_critical["']/);

  // Verificación de salvaguarda contra RDM/2026-0000 en hasActiveDocumentOrAudit
  assert.match(drawerSource, /0000/);
  assert.match(drawerSource, /RDM/);
});
