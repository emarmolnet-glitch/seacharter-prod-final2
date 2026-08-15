import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serviceSource = await readFile(new URL('../vesselRecommendationService.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('recommendation service sends cargo requirements to the Data Bridge endpoint', async () => {
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(serviceSource).toString('base64')}`;
  const { fetchVesselRecommendations } = await import(moduleUrl);
  let requestedUrl = '';

  const payload = await fetchVesselRecommendations(
    { targetDwt: 18500, vesselType: 'HANDYSIZE', loadLat: 36.13, loadLon: -5.35 },
    {
      fetchImpl: async (url, options) => {
        requestedUrl = String(url);
        assert.equal(options.method, 'GET');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.headers['Cache-Control'], 'no-cache, no-store, must-revalidate');
        return new Response(JSON.stringify([{ vessel_name: 'Baltic Meridian' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  );

  assert.match(requestedUrl, /^\/api\/databridge\/vessels\/recommend\?/);
  assert.match(requestedUrl, /targetDwt=18500/);
  assert.match(requestedUrl, /vesselType=HANDYSIZE/);
  assert.match(requestedUrl, /loadLat=36\.13/);
  assert.match(requestedUrl, /loadLon=-5\.35/);
  assert.equal(payload[0].vessel_name, 'Baltic Meridian');
});

test('matching UI renders Data Bridge ranking only from validated matching results', () => {
  assert.doesNotMatch(indexSource, /vesselRecommendationService\.js/);
  assert.match(indexSource, /Encontrar Match \/ Find Vessels/);
  assert.doesNotMatch(indexSource, /requestDataBridgeVesselRecommendations|fetchVesselRecommendations/);
  assert.match(indexSource, /function getValidatedDataBridgeRecommendationRows\(matches\)/);
  assert.match(indexSource, /source_origins\.includes\('DATABRIDGE'\)/);
  assert.match(indexSource, /syncDataBridgeRankingWithMatchingResults\?\.\(displayMatches\)/);
  assert.match(indexSource, /syncDataBridgeRankingWithMatchingResults\?\.\(\[\]\)/);
  assert.match(indexSource, /\['distance_nm', 'distanceNm', 'distance_to_load_nm'\]/);
  assert.match(indexSource, /\['total_score', 'totalScore', 'score'\]/);
  assert.match(indexSource, /id="databridge-recommendations-body"/);
  assert.match(indexSource, /\$\{score\.toFixed\(1\)\}/);
});

test('ranking table exposes technical, AIS and Neon metadata at a glance', () => {
  assert.match(indexSource, />GT \/ DWT</);
  assert.match(indexSource, />Bandera \/ Año</);
  assert.match(indexSource, />Dimensiones</);
  assert.match(indexSource, />Manga \$\{formatRecommendationNumber\(beamMeters/);
  assert.match(indexSource, />Calado \$\{formatRecommendationNumber\(draftMeters/);
  assert.match(indexSource, />Velocidad \/ Estado</);
  assert.match(indexSource, />ETA</);
  assert.match(indexSource, /\['gross_tonnage', 'grossTonnage', 'gt', 'GT'\]/);
  assert.match(indexSource, /\['draft_meters', 'draftMeters', 'draft', 'Draft', 'draught', 'Draught', 'current_draft', 'currentDraft'\]/);
  assert.match(indexSource, /record\?\.source_payload/);
  assert.match(indexSource, /record\?\.MetaData/);
  assert.match(indexSource, /renderRecommendationUnavailable\(label = 'N\/A'\)/);
});

test('ranking checkbox activates the estimator and synchronized vessel detail', () => {
  assert.match(indexSource, /class="fleet-ranking-select"/);
  assert.match(indexSource, /onchange="handleDataBridgeRecommendationSelection\(event, \$\{index\}\)"/);
  assert.match(indexSource, /accent-color: #0891b2/);
  assert.match(indexSource, /data-active-estimator-vessel="\$\{isActive\}"/);
  assert.match(indexSource, /window\.GlobalStore\.calculatorVessel = vessel/);
  assert.match(indexSource, /calculateDataBridgeRecommendationBallast\(vessel\)/);
  assert.match(indexSource, /calculateRouteWithChokepoints\(origin, destination, \{ allowGeodesicFallback: false \}\)/);
  assert.match(indexSource, /applyResolvedVesselToCalculator\(vesselWithRoute, vesselWithRoute\.vessel_name\)/);
  assert.match(indexSource, /applyMatchingCandidate\?\.\(\{/);
  assert.match(indexSource, /lastreCoordinates: ballastRoute\.coordinates/);
  assert.match(indexSource, /new CustomEvent\('vessel-selection:changed'/);
  assert.match(indexSource, /card\.dataset\.activeEstimatorVessel = String\(isActive\)/);
});

test('ranking fills its container and exposes row-level Due Diligence', () => {
  assert.match(indexSource, /id="databridge-recommendations-panel" class="[^"]*w-full max-w-none/);
  assert.match(indexSource, /id="ranking-cards-canvas" class="hidden flex-1 min-w-0 overflow-auto" data-matching-result-count="0"/);
  assert.match(indexSource, /class="fleet-ranking-table w-full min-w-\[1050px\] text-left"/);
  assert.doesNotMatch(indexSource, /fleet-ranking-table w-full min-w-\[1080px\]/);
  assert.match(indexSource, />Verificación</);
  assert.match(indexSource, /class="fleet-ranking-due-button/);
  assert.match(indexSource, /data-due-diligence-payload="\$\{dueDiligenceIdentity\}"/);
  assert.match(indexSource, /<span>Verificar<\/span>/);
});
