import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distIndexSource = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

test('index.html and dist/index.html contain top-bar FAQ button and openFaqModal function', () => {
  for (const html of [indexSource, distIndexSource]) {
    // Header access button
    assert.match(html, /id="btn-open-faq-modal"/);
    assert.match(html, /onclick="openFaqModal\(\)"/);
    assert.match(html, /<span>FAQ<\/span>/);

    // JS functions
    assert.match(html, /function openFaqModal\(\)/);
    assert.match(html, /function closeFaqModal\(\)/);
    assert.match(html, /function exportFaqToPdf\(\)/);
    assert.match(html, /window\.openFaqModal = openFaqModal/);
  }
});

test('FAQ modal contains required corporate manual sections, semantic markup, and positioning classes', () => {
  for (const html of [indexSource, distIndexSource]) {
    // Modal container & positioning
    assert.match(html, /id="faq-modal"[^>]*items-start/);
    assert.match(html, /id="faq-modal"[^>]*pt-20/);
    assert.match(html, /id="faq-modal"[^>]*z-\[100\]/);
    assert.match(html, /id="faq-manual-content"/);
    assert.match(html, /max-h-\[85vh\]/);
    assert.match(html, /id="btn-export-faq-pdf"/);
    assert.match(html, /onclick="exportFaqToPdf\(\)"/);

    // Refactored Header Title
    assert.match(html, /<h1[^>]*>\s*Documentación de SeaCharter Core PRO\s*<\/h1>/);

    // Visión General Corporativa
    assert.match(html, /Visión General Corporativa/);
    assert.match(html, /Rodahmar Shipping SL/);
    assert.match(html, /GENCON 94/);

    // Módulos
    assert.match(html, /Módulos de la Interfaz y Lógica Interna/);
    assert.match(html, /Mapa y Estado Geográfico/);
    assert.match(html, /Calculadora \(Voyage Estimator\)/);
    assert.match(html, /Decisiones \(DSS\)/);
    assert.match(html, /Densidad de Flota AIS/);
    assert.match(html, /Coincidencia \(Matching Engine\)/);
    assert.match(html, /Editor Contractual \(GENCON 94\)/);
    assert.match(html, /Auditoría de Riesgo y Ofertas/);

    // Menús Desplegables y Herramientas Avanzadas
    assert.match(html, /Menús Desplegables y Herramientas Avanzadas/);
    assert.match(html, /Menú de Configuración/);
    assert.match(html, /Editor ASBATANKVOY/);
    assert.match(html, /CBAM/);
    assert.match(html, /Modo Dual - Trading & Chartering/);
    assert.match(html, /Menú de Sesión y Data Bridge/);
    assert.match(html, /Guardar \/ Cargar Sesión/);
    assert.match(html, /Motor NPL \(Arma Secreta Data Bridge\)/);

    // Q&A
    assert.match(html, /Preguntas Frecuentes \(FAQ\) — Guías Paso a Paso/);
    assert.match(html, /¿Cómo hacer una nueva estimación paso a paso\?/);
    assert.match(html, /¿Cómo puedo cambiar de modo manual a modo automático en la introducción de datos\?/);
    assert.match(html, /¿Cómo aplicar y auditar un contrato de fletamento GENCON 94\?/);
    assert.match(html, /¿Cómo verificar la densidad de la flota en tiempo real y filtrar por tipo de buque\?/);
    assert.match(html, /¿Cómo exportar e integrar el reporte ejecutivo con el Data Bridge\?/);
    assert.match(html, /¿Cómo calcula el DSS los Días de Puerto y Navegación\?/);
    assert.match(html, /¿Qué es la alerta de Déficit de Exportación \(Backhaul Risk\)\?/);
    assert.match(html, /¿El sistema contempla riesgos geopolíticos\?/);
    assert.match(html, /¿Qué es el Generador del Reporte de Mercado \(Market Report\) y quién lo emite\?/);
    assert.match(html, /¿Cómo funciona el Motor de Análisis Cualitativo \(Narrative Engine\)\?/);
    assert.match(html, /¿Qué características presenta el diseño visual del Reporte PDF\?/);
    assert.match(html, /¿Cómo se ejecuta el informe en el Doble Modo \(Automático y On-Demand\)\?/);
    assert.match(html, /¿Cómo monitoriza el DSS Auto-Ballast el riesgo de posicionamiento en vacío\?/);
    assert.match(html, /¿Cómo se auditan e integran los riesgos geopolíticos JWC y la congestión portuaria\?/);

    // Arquitectura Sandbox
    assert.match(html, /Arquitectura Sandbox y Aislamiento de Memoria/);
    assert.match(html, /window\.exploratoryVesselsCache/);
    assert.match(html, /Barrido Exploratorio Excepcional/);
    assert.match(html, /Lazy Loading/);

    // Anexo Matemático
    assert.match(html, /Anexo Matemático y Algoritmos de Flete/);
    assert.match(html, /Determinación del Flete Justo y Break-Even/);
    assert.match(html, /Fase 1 \(Gastos de Viaje\)/);
    assert.match(html, /Fase 2 \(Costes Fijos\)/);
    assert.match(html, /Fase 3 \(Distribución\)/);
    assert.match(html, /Fase 4 \(Margen\)/);
    assert.match(html, /Cálculo de Distancia Ortodrómica/);
    assert.match(html, /distancia náutica más corta sobre la superficie esférica terrestre/);

    // PDF filename
    assert.match(html, /SeaCharter_Core_PRO_Manual\.pdf/);
  }
});
