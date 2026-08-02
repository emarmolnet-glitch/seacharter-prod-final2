const DATA_BRIDGE_RECOMMENDATIONS_PROXY = '/api/databridge/vessels/recommend';
const DATA_BRIDGE_RECOMMENDATIONS_PATH = '/api/vessels/recommend';
const DATA_BRIDGE_API_URL = typeof window !== 'undefined'
    ? String(window.DATA_BRIDGE_API_URL || '').trim()
    : '';

function buildRecommendationsUrl(cargoRequirements, baseUrl = '') {
    const queryParams = new URLSearchParams();
    Object.entries(cargoRequirements || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || String(value).trim() === '') return;
        queryParams.set(key, String(value));
    });

    const configuredBaseUrl = String(baseUrl || DATA_BRIDGE_API_URL).trim();
    const endpoint = configuredBaseUrl
        ? new URL(DATA_BRIDGE_RECOMMENDATIONS_PATH, `${configuredBaseUrl.replace(/\/+$/, '')}/`).toString()
        : DATA_BRIDGE_RECOMMENDATIONS_PROXY;
    const query = queryParams.toString();
    return query ? `${endpoint}?${query}` : endpoint;
}

export async function fetchVesselRecommendations(cargoRequirements, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new Error('El navegador no permite consultar recomendaciones de buques');
    }

    const response = await fetchImpl(
        buildRecommendationsUrl(cargoRequirements, options.baseUrl),
        {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: options.signal
        }
    );

    if (!response.ok) {
        throw new Error('Error al obtener recomendaciones de buques');
    }

    return response.json();
}

if (typeof window !== 'undefined') {
    window.fetchVesselRecommendations = fetchVesselRecommendations;
}
