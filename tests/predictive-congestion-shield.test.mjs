import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html contains fetchPortCongestionShield with 10 NM AIS radar sweep and operational structured fields', () => {
  assert.match(indexSource, /async function fetchPortCongestionShield\(\{[\s\S]*\}\)/);
  assert.match(indexSource, /radiusNm:\s*10/);
  assert.match(indexSource, /try\s*\{[\s\S]*\/\/\s*Barrido de radar AIS en radio estricto de 10 NM para POL y POD/);
  assert.match(indexSource, /pol:\s*polTelemetry/);
  assert.match(indexSource, /pod:\s*podTelemetry/);
});

test('renderPortCongestionShield and renderTceWithCongestionShield are registered and use insertAdjacentElement afterend', () => {
  assert.match(indexSource, /function renderPortCongestionShield\(congestionData\)/);
  assert.match(indexSource, /function renderTceWithCongestionShield\(baseTce, baseDays, congestionData\)/);
  assert.match(indexSource, /geoInputContainer\.insertAdjacentElement\('afterend',\s*shieldCard\)/);
  assert.match(indexSource, /shieldCard\.id = 'congestion-shield-sidebar-card'/);
  assert.match(indexSource, /map-floating-panel route-sync-card ecosystem-panel/);
});

test('Predictive Congestion Shield focuses strictly on operational metrics and has NO TCE fields', () => {
  assert.match(indexSource, /<span class="px-1\.5 py-0\.5 rounded text-\[10px\] font-bold bg-blue-100 text-blue-800 border border-blue-200">POL<\/span>/);
  assert.match(indexSource, /<span class="px-1\.5 py-0\.5 rounded text-\[10px\] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">POD<\/span>/);
  assert.match(indexSource, /Espera estimada:/);
  assert.match(indexSource, /Estado operativo:/);
  assert.match(indexSource, /Riesgo Demurrage:/);
  assert.match(indexSource, /Tráfico en zona:/);
  assert.match(indexSource, /Demora Total Proyectada:/);
  assert.match(indexSource, /AIS RADAR 10 NM/);
  
  // Verify that TCE fields have been removed from the template
  assert.doesNotMatch(indexSource, /TCE Ajustado:/);
  assert.doesNotMatch(indexSource, /Impacto Neto en TCE:/);
});

test('Predictive Congestion Shield DOM insertion and operational rendering executes correctly in mock DOM', async () => {
  const elements = new Map();
  
  const mapInputOverlay = {
    id: 'map-input-overlay',
    className: 'map-floating-panel route-sync-card ecosystem-panel space-y-4',
    offsetTop: 18,
    offsetHeight: 380,
    nextSibling: null,
    parentNode: {
      insertBefore: (newNode, refNode) => {
        elements.set(newNode.id, newNode);
      }
    },
    insertAdjacentElement: function(position, element) {
      if (position === 'afterend') {
        this.nextSibling = element;
        elements.set(element.id, element);
        return element;
      }
      return null;
    }
  };
  elements.set('map-input-overlay', mapInputOverlay);

  const mockDocument = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel.includes('map-input-overlay')) return elements.get('map-input-overlay');
      return null;
    },
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        attributes: {},
        classList: {
          contains: (cls) => el.className.split(' ').includes(cls)
        },
        setAttribute: (k, v) => { el.attributes[k] = v; },
        getAttribute: (k) => el.attributes[k]
      };
      return el;
    },
    body: {
      appendChild: (el) => { elements.set(el.id, el); }
    }
  };

  const mockWindow = {
    State: { pol: 'Santos', pod: 'Rotterdam', polCoordinates: [-23.96, -46.33], podCoordinates: [51.92, 4.47] },
    document: mockDocument
  };

  const fnCode = `
    const window = mockWindow;
    const document = mockDocument;
    ${indexSource.slice(indexSource.indexOf('async function fetchPortCongestionShield'), indexSource.indexOf('async function runOnDemandMapRouteWorkflow'))}
    return { fetchPortCongestionShield, renderPortCongestionShield, renderTceWithCongestionShield };
  `;

  const factory = new Function('mockWindow', 'mockDocument', fnCode);
  const { fetchPortCongestionShield, renderPortCongestionShield, renderTceWithCongestionShield } = factory(mockWindow, mockDocument);

  const data = await fetchPortCongestionShield({
    portUnlocode: 'Rotterdam',
    vesselImo: 9123456,
    demurrageRateUsd: 25000,
    distanceNm: 5400,
    nominalSpeedKnots: 13.0
  });

  assert.equal(data.pol.name, 'Santos');
  assert.equal(data.pol.radiusNm, 10);
  assert.equal(data.pol.delayDays, 0.5);
  assert.equal(data.pol.status, 'Fluido');
  assert.equal(data.pol.operationalStatus, 'Operativo');
  assert.equal(data.pol.demurrageRiskUsd, 0);

  assert.equal(data.pod.name, 'Rotterdam');
  assert.equal(data.pod.radiusNm, 10);
  assert.equal(data.pod.delayDays, 1.8);
  assert.equal(data.pod.status, 'Congestionado');
  assert.equal(data.pod.demurrageRiskUsd, 25000);

  const renderedCard = renderPortCongestionShield(data);
  assert.ok(renderedCard);
  assert.equal(renderedCard.id, 'congestion-shield-sidebar-card');
  assert.equal(mapInputOverlay.nextSibling, renderedCard);
  assert.match(renderedCard.innerHTML, /Santos/);
  assert.match(renderedCard.innerHTML, /Rotterdam/);
  assert.match(renderedCard.innerHTML, /Predictive Congestion Shield/);
  assert.match(renderedCard.innerHTML, /AIS RADAR 10 NM/);
  assert.match(renderedCard.innerHTML, /Espera estimada:.*1\.8 d/);
  assert.match(renderedCard.innerHTML, /Demurrage:.*\$25,000/);
  assert.match(renderedCard.innerHTML, /Demora Total Proyectada:[\s\S]*2\.3 d/);
  
  // Ensure no TCE is in rendered output
  assert.doesNotMatch(renderedCard.innerHTML, /TCE/);
  assert.doesNotMatch(renderedCard.innerHTML, /Ajustado/);
});

test('Map integrity and routing logic are strictly preserved', () => {
  assert.match(indexSource, /calculateVoyageRouteService\(\{ portBallast, pol, pod, geocode: true \}\)/);
  assert.match(indexSource, /stopRouteGlobeRotation/);
  assert.match(indexSource, /renderMasterRouteMap/);
});
