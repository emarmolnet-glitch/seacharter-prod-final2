/**
 * iContainers (Brutus API) Service Layer for SeaCharter Core PRO
 * Conforms to iContainers Brutus OpenAPI v3.0.0 specification.
 * 
 * Provides isolated backend integration for the 5 Multimodal Quoter tabs:
 * 1. FCL (Full Container Load)
 * 2. LCL (Less than Container Load)
 * 3. Air Freight
 * 4. Ground LTL (USA)
 * 5. Amazon FBA / Ecommerce Orders
 */

export const BASE_URL = (typeof process !== "undefined" && process.env?.ICONTAINERS_BASE_URL) || "https://brutus-dev.icontainers.com";

/**
 * Custom Error class for iContainers API communication failures
 */
export class IContainersApiError extends Error {
  constructor(message, { status = 0, statusText = "", endpoint = "", details = null } = {}) {
    super(message);
    this.name = "IContainersApiError";
    this.status = status;
    this.statusText = statusText;
    this.endpoint = endpoint;
    this.details = details;
  }
}

/**
 * Resolves current API Key from environment (process.env or Netlify.env)
 */
function resolveApiKey(explicitKey) {
  if (explicitKey) return explicitKey;
  if (typeof process !== "undefined" && process.env?.ICONTAINERS_API_KEY) {
    return process.env.ICONTAINERS_API_KEY;
  }
  if (typeof Netlify !== "undefined" && Netlify.env?.get?.("ICONTAINERS_API_KEY")) {
    return Netlify.env.get("ICONTAINERS_API_KEY");
  }
  return "";
}

/**
 * Generic internal HTTP client for Brutus API requests.
 * Injects Bearer token authentication and handles errors.
 * 
 * @param {string} endpoint - API endpoint path (e.g. '/api/v1/quotes/fcl')
 * @param {Object} [options] - Request options
 * @param {string} [options.method='GET'] - HTTP method (GET, POST, etc.)
 * @param {*} [options.body] - Request body object or string
 * @param {Object} [options.headers] - Additional HTTP headers
 * @param {string} [options.apiKey] - Explicit API key override
 * @param {string} [options.baseUrl] - Base URL override
 * @param {Function} [options.fetchFn] - Custom fetch implementation for test mocking
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
  const {
    method = "GET",
    body,
    headers: customHeaders = {},
    apiKey,
    baseUrl = BASE_URL,
    fetchFn = globalThis.fetch,
    ...restOptions
  } = options;

  if (typeof fetchFn !== "function") {
    throw new Error("No fetch implementation available in the current environment.");
  }

  const normalizedUrl = endpoint.startsWith("http://") || endpoint.startsWith("https://")
    ? endpoint
    : `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;

  const resolvedToken = resolveApiKey(apiKey);

  const headers = {
    Accept: "application/json",
    ...customHeaders,
  };

  if (body !== undefined && body !== null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (resolvedToken) {
    headers.Authorization = `Bearer ${resolvedToken}`;
  }

  const fetchInit = {
    method: method.toUpperCase(),
    headers,
    ...restOptions,
  };

  if (body !== undefined && body !== null) {
    fetchInit.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  let response;
  try {
    response = await fetchFn(normalizedUrl, fetchInit);
  } catch (networkError) {
    throw new IContainersApiError(
      `Network failure requesting iContainers API (${endpoint}): ${networkError.message}`,
      { status: 0, statusText: "NETWORK_ERROR", endpoint, details: networkError }
    );
  }

  let responseData = null;
  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      responseData = await response.json();
    } catch (_) {
      responseData = null;
    }
  } else {
    try {
      responseData = await response.text();
    } catch (_) {
      responseData = null;
    }
  }

  if (!response.ok) {
    const errorMsg =
      (responseData && typeof responseData === "object" && (responseData.message || responseData.error || responseData.detail)) ||
      (typeof responseData === "string" && responseData) ||
      `HTTP ${response.status} ${response.statusText}`;

    throw new IContainersApiError(
      `iContainers API Error [${response.status} ${response.statusText}]: ${errorMsg}`,
      {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        details: responseData,
      }
    );
  }

  return responseData;
}

// =============================================================================
// 2. MÓDULO DE AUTOCOMPLETADO (PLACES)
// =============================================================================

/**
 * Searches maritime ports and locations for FCL or LCL shipments.
 * GET /api/v1/locations/maritime/places?term={term}&shipmentType={FCL|LCL}
 * 
 * @param {string} term - Search query (e.g. "Valencia", "ESVLC", "Hamburg")
 * @param {string} [shipmentType='FCL'] - "FCL" or "LCL"
 * @param {Object} [options] - Additional request options
 * @returns {Promise<Array<Object>>} List of matching maritime places
 */
export async function searchMaritimePlaces(term, shipmentType = "FCL", options = {}) {
  if (!term || typeof term !== "string" || !term.trim()) {
    return [];
  }

  const normalizedType = String(shipmentType || "FCL").toUpperCase();
  if (normalizedType !== "FCL" && normalizedType !== "LCL") {
    throw new Error(`Invalid shipmentType "${shipmentType}". Expected "FCL" or "LCL".`);
  }

  const queryParams = new URLSearchParams({
    term: term.trim(),
    shipmentType: normalizedType,
  });

  return apiRequest(`/api/v1/locations/maritime/places?${queryParams.toString()}`, {
    method: "GET",
    ...options,
  });
}

/**
 * Searches aerial airports and locations for Air shipments.
 * GET /api/v1/locations/aerial/places?term={term}
 * 
 * @param {string} term - Search query (e.g. "MAD", "Madrid", "JFK")
 * @param {Object} [options] - Additional request options
 * @returns {Promise<Array<Object>>} List of matching aerial places
 */
export async function searchAerialPlaces(term, options = {}) {
  if (!term || typeof term !== "string" || !term.trim()) {
    return [];
  }

  const queryParams = new URLSearchParams({
    term: term.trim(),
  });

  return apiRequest(`/api/v1/locations/aerial/places?${queryParams.toString()}`, {
    method: "GET",
    ...options,
  });
}

// =============================================================================
// 5. EXTRACCIÓN Y FORMATEO DE COTIZACIONES
// =============================================================================

/**
 * Extracts and normalizes the primary rate and quote metadata from an iContainers quote response.
 * Handles structures with `uuid` and `rates` array according to Brutus OpenAPI spec.
 * 
 * @param {Object} rawResponse - Raw API response from Brutus quotes endpoint
 * @returns {Object} Cleaned quote object containing uuid, primaryRate, rates array, and metadata
 */
export function formatQuoteResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== "object") {
    return {
      uuid: null,
      primaryRate: null,
      rates: [],
      hasRates: false,
      raw: rawResponse,
    };
  }

  const uuid = rawResponse.uuid || rawResponse.id || rawResponse.data?.uuid || null;
  const rates = Array.isArray(rawResponse.rates)
    ? rawResponse.rates
    : Array.isArray(rawResponse.data?.rates)
    ? rawResponse.data.rates
    : [];

  let primaryRate = null;
  if (rates.length > 0) {
    const rawRate = rates[0];
    const rawTotal = rawRate.totalAmount ?? rawRate.total ?? rawRate.price ?? rawRate.amount ?? null;
    const numericTotal = rawTotal !== null && Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : null;

    primaryRate = {
      id: rawRate.id || rawRate.rateId || null,
      carrier: rawRate.carrier || rawRate.carrierName || rawRate.line || rawRate.airline || "Unknown Carrier",
      carrierCode: rawRate.carrierCode || rawRate.scac || rawRate.iataCarrierCode || null,
      totalAmount: numericTotal,
      currency: rawRate.currency || "USD",
      transitTimeDays: rawRate.transitTime ?? rawRate.transitDays ?? rawRate.transitTimeDays ?? null,
      validUntil: rawRate.validUntil || rawRate.expirationDate || rawRate.expiresAt || null,
      oceanFreight: rawRate.oceanFreight ?? rawRate.baseFreight ?? null,
      airFreight: rawRate.airFreight ?? null,
      breakdown: rawRate.breakdown || rawRate.charges || rawRate.items || [],
      surcharges: rawRate.surcharges || [],
      serviceType: rawRate.serviceType || rawRate.mode || null,
      raw: rawRate,
    };
  }

  return {
    uuid,
    primaryRate,
    rates,
    hasRates: rates.length > 0,
    raw: rawResponse,
  };
}

export const extractMainQuote = formatQuoteResponse;

// =============================================================================
// 3. MÓDULO DE COTIZACIONES MARÍTIMAS Y AÉREAS (QUOTES)
// =============================================================================

/**
 * Creates an FCL (Full Container Load) quote.
 * POST /api/v1/quotes/fcl
 * 
 * @param {Object} params
 * @param {string|Object} params.originIso - Port ISO code (e.g. "ESVLC") or port object
 * @param {string|Object} params.destIso - Port ISO code (e.g. "USMIA") or port object
 * @param {Array<Object>|Object} params.containers - Containers array (e.g. [{ containerType: "40HC", quantity: 1 }])
 * @param {Object} [options] - Additional request options
 * @returns {Promise<Object>} Cleaned quote object with uuid and primaryRate
 */
export async function createFclQuote({ originIso, destIso, containers }, options = {}) {
  if (!originIso) throw new Error("FCL quote requires 'originIso'.");
  if (!destIso) throw new Error("FCL quote requires 'destIso'.");

  const origin = typeof originIso === "object" && originIso?.portIsoCode
    ? { type: "port", ...originIso }
    : { type: "port", portIsoCode: String(originIso).trim().toUpperCase() };

  const destination = typeof destIso === "object" && destIso?.portIsoCode
    ? { type: "port", ...destIso }
    : { type: "port", portIsoCode: String(destIso).trim().toUpperCase() };

  const formattedContainers = Array.isArray(containers)
    ? containers
    : containers
    ? [containers]
    : [];

  const body = {
    origin,
    destination,
    containers: formattedContainers,
  };

  const raw = await apiRequest("/api/v1/quotes/fcl", {
    method: "POST",
    body,
    ...options,
  });

  return formatQuoteResponse(raw);
}

/**
 * Creates an LCL (Less than Container Load) quote.
 * POST /api/v1/quotes/lcl
 * 
 * @param {Object} params
 * @param {string|Object} params.originIso - Port ISO code (e.g. "ESVLC") or port object
 * @param {string|Object} params.destIso - Port ISO code (e.g. "USMIA") or port object
 * @param {Array<Object>|Object} params.cargo - Cargo specification (volume, weight, package count, dimensions)
 * @param {Object} [options] - Additional request options
 * @returns {Promise<Object>} Cleaned quote object with uuid and primaryRate
 */
export async function createLclQuote({ originIso, destIso, cargo }, options = {}) {
  if (!originIso) throw new Error("LCL quote requires 'originIso'.");
  if (!destIso) throw new Error("LCL quote requires 'destIso'.");

  const origin = typeof originIso === "object" && originIso?.portIsoCode
    ? { type: "port", ...originIso }
    : { type: "port", portIsoCode: String(originIso).trim().toUpperCase() };

  const destination = typeof destIso === "object" && destIso?.portIsoCode
    ? { type: "port", ...destIso }
    : { type: "port", portIsoCode: String(destIso).trim().toUpperCase() };

  const body = {
    origin,
    destination,
    cargo: cargo || {},
  };

  const raw = await apiRequest("/api/v1/quotes/lcl", {
    method: "POST",
    body,
    ...options,
  });

  return formatQuoteResponse(raw);
}

/**
 * Creates an Air Freight quote.
 * POST /api/v1/quotes/air
 * 
 * @param {Object} params
 * @param {string|Object} params.originIata - Airport IATA code (e.g. "MAD") or airport object
 * @param {string|Object} params.destIata - Airport IATA code (e.g. "JFK") or airport object
 * @param {Array<Object>|Object} params.cargo - Cargo package details with dimensions, weight and unit
 * @param {string} [params.cargoReadyDate] - Ready date in ISO format YYYY-MM-DD
 * @param {boolean} [params.isKnownShipper=true] - Known shipper indicator (default: true)
 * @param {Object} [options] - Additional request options
 * @returns {Promise<Object>} Cleaned quote object with uuid and primaryRate
 */
export async function createAirQuote(
  { originIata, destIata, cargo, cargoReadyDate, isKnownShipper = true },
  options = {}
) {
  if (!originIata) throw new Error("Air quote requires 'originIata'.");
  if (!destIata) throw new Error("Air quote requires 'destIata'.");

  const origin = typeof originIata === "object" && originIata?.iataCode
    ? { type: "airport", ...originIata }
    : { type: "airport", iataCode: String(originIata).trim().toUpperCase() };

  const destination = typeof destIata === "object" && destIata?.iataCode
    ? { type: "airport", ...destIata }
    : { type: "airport", iataCode: String(destIata).trim().toUpperCase() };

  const defaultReadyDate = new Date().toISOString().split("T")[0];

  const body = {
    origin,
    destination,
    cargo: cargo || {},
    cargoReadyDate: cargoReadyDate || defaultReadyDate,
    isKnownShipper: Boolean(isKnownShipper),
  };

  const raw = await apiRequest("/api/v1/quotes/air", {
    method: "POST",
    body,
    ...options,
  });

  return formatQuoteResponse(raw);
}

// =============================================================================
// 4. MÓDULO DE TERRESTRE EE.UU. Y AMAZON FBA (LTL & ECOMMERCE)
// =============================================================================

/**
 * Creates a US Domestic Ground LTL quote.
 * POST /api/v1/quotes/ltl
 * Uses type: "postalCode" and country: "US".
 * 
 * @param {Object} params
 * @param {string|number|Object} params.originZip - US 5-digit zip code
 * @param {string|number|Object} params.destZip - US 5-digit zip code
 * @param {Array<Object>|Object} params.cargo - Pallet / package details
 * @param {string} [params.freightClass="70"] - NMFC Freight Class (default: "70")
 * @param {Object} [options] - Additional request options
 * @returns {Promise<Object>} Cleaned quote object with uuid and rates
 */
export async function createLtlQuote({ originZip, destZip, cargo, freightClass = "70" }, options = {}) {
  if (!originZip) throw new Error("LTL quote requires 'originZip'.");
  if (!destZip) throw new Error("LTL quote requires 'destZip'.");

  const origin = typeof originZip === "object" && originZip?.postalCode
    ? { type: "postalCode", country: "US", ...originZip }
    : { type: "postalCode", postalCode: String(originZip).trim(), country: "US" };

  const destination = typeof destZip === "object" && destZip?.postalCode
    ? { type: "postalCode", country: "US", ...destZip }
    : { type: "postalCode", postalCode: String(destZip).trim(), country: "US" };

  const body = {
    origin,
    destination,
    freightClass: String(freightClass),
    cargo: cargo || {},
  };

  const raw = await apiRequest("/api/v1/quotes/ltl", {
    method: "POST",
    body,
    ...options,
  });

  return formatQuoteResponse(raw);
}

/**
 * Creates an Ecommerce / Amazon FBA order.
 * POST /api/v1/ecommerce/orders
 * 
 * @param {Object} params
 * @param {string} [params.serviceType="LAST_MILE"] - Service type (e.g. "LAST_MILE", "FBA_FULFILLMENT")
 * @param {string} params.hubCode - Target Amazon Fulfillment Center / Hub Code (e.g. "ONT8", "BFI4")
 * @param {Object} params.shipper - Shipper address and contact info
 * @param {Object} params.consignee - Consignee / Delivery destination details
 * @param {Object|Array} params.packageData - Packages, cartons, SKU, labels and dimensions
 * @param {Object} [options] - Additional request options
 * @returns {Promise<Object>} Order confirmation details
 */
export async function createEcommerceOrder(
  { serviceType = "LAST_MILE", hubCode, shipper, consignee, packageData },
  options = {}
) {
  const body = {
    serviceType: serviceType || "LAST_MILE",
    hubCode: hubCode || null,
    shipper: shipper || {},
    consignee: consignee || {},
    packageData: packageData || {},
  };

  const raw = await apiRequest("/api/v1/ecommerce/orders", {
    method: "POST",
    body,
    ...options,
  });

  return {
    success: true,
    orderId: raw?.id || raw?.orderId || raw?.uuid || null,
    trackingNumber: raw?.trackingNumber || raw?.tracking_number || null,
    status: raw?.status || "CREATED",
    data: raw,
  };
}

// =============================================================================
// DEFAULT EXPORT (SERVICE OBJECT)
// =============================================================================

const iContainersService = {
  BASE_URL,
  IContainersApiError,
  apiRequest,
  searchMaritimePlaces,
  searchAerialPlaces,
  createFclQuote,
  createLclQuote,
  createAirQuote,
  createLtlQuote,
  createEcommerceOrder,
  formatQuoteResponse,
  extractMainQuote,
};

export default iContainersService;
