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

test('matching UI requests and renders the Data Bridge recommendation fields', () => {
  assert.match(indexSource, /vesselRecommendationService\.js/);
  assert.match(indexSource, /Encontrar Match \/ Find Vessels/);
  assert.match(indexSource, /requestDataBridgeVesselRecommendations\(\{[\s\S]*targetDwt:[\s\S]*vesselType:[\s\S]*loadLat:[\s\S]*loadLon:/);
  assert.match(indexSource, /\['distance_nm', 'distanceNm', 'distance_to_load_nm'\]/);
  assert.match(indexSource, /\['total_score', 'totalScore', 'score'\]/);
  assert.match(indexSource, /id="databridge-recommendations-body"/);
  assert.match(indexSource, /\$\{score\.toFixed\(1\)\}\/100/);
});

test('ranking table exposes technical, AIS and Neon metadata at a glance', () => {
  assert.match(indexSource, />GT \/ DWT</);
  assert.match(indexSource, />Bandera \/ Año</);
  assert.match(indexSource, />LOA \/ Manga</);
  assert.match(indexSource, />Calado actual</);
  assert.match(indexSource, />Velocidad \/ Estado</);
  assert.match(indexSource, />ETA</);
  assert.match(indexSource, /\['gross_tonnage', 'grossTonnage', 'gt', 'GT'\]/);
  assert.match(indexSource, /\['draft_meters', 'draftMeters', 'draft', 'Draft', 'draught', 'Draught', 'current_draft', 'currentDraft'\]/);
  assert.match(indexSource, /record\?\.source_payload/);
  assert.match(indexSource, /record\?\.MetaData/);
  assert.match(indexSource, /renderRecommendationUnavailable\(label = 'N\/A'\)/);
});
