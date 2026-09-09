async function fetchJsonWithTimeout(url, init, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function compactSearchText(items) {
  return items
    .map((item, index) => {
      const title = String(item?.title || "").trim();
      const url = String(item?.url || item?.link || "").trim();
      const content = String(item?.content || item?.snippet || item?.description || "").replace(/\s+/g, " ").trim();
      return [title && `${index + 1}. ${title}`, url && `Fuente: ${url}`, content && `Extracto: ${content}`]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
}

export async function searchTavily(query) {
  const apiKey = process.env.TAVILY_API_KEY || process.env.NETLIFY_TAVILY_API_KEY;
  if (!apiKey) return "";
  const data = await fetchJsonWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 5,
    }),
  });
  const results = Array.isArray(data?.results) ? data.results : [];
  const answer = String(data?.answer || "").trim();
  const context = compactSearchText(results.map((result) => ({
    title: String(result?.title || ""),
    url: String(result?.url || ""),
    content: String(result?.content || ""),
  })));
  return [answer && `Respuesta sintetizada: ${answer}`, context].filter(Boolean).join("\n\n");
}

export async function searchSerpApi(query) {
  const apiKey = process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY;
  if (!apiKey) return "";
  const endpoint = new URL("https://serpapi.com/search.json");
  endpoint.searchParams.set("engine", "google");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("num", "5");
  const data = await fetchJsonWithTimeout(endpoint.toString(), { headers: { accept: "application/json" } });
  const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return compactSearchText(organic.map((result) => ({
    title: String(result?.title || ""),
    url: String(result?.link || ""),
    content: String(result?.snippet || ""),
  })));
}

export async function searchBrave(query) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
  if (!apiKey) return "";
  const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", "5");
  const data = await fetchJsonWithTimeout(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "x-subscription-token": apiKey,
    },
  });
  const results = Array.isArray(data?.web?.results) ? data.web.results : [];
  return compactSearchText(results.map((result) => ({
    title: String(result?.title || ""),
    url: String(result?.url || ""),
    content: String(result?.description || ""),
  })));
}

export async function searchCommercialWeb(query) {
  const providers = [searchTavily, searchSerpApi, searchBrave];
  for (const provider of providers) {
    try {
      const result = await provider(query);
      if (result && typeof result === "string" && result.trim().length > 0) {
        return result.trim();
      }
    } catch {
      // Continue to next provider
    }
  }
  return "";
}

export function isCommercialEntitiesQuery(message) {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const patterns = [
    /\b(armador(?:es)?|dueno[s]?|dueño[s]?|propietari[oa]s?|shipowner[s]?|owner[s]?)\b/i,
    /\b(consignatari[oa]s?|consignee[s]?)\b/i,
    /\b(agente[s]?|shipping agent[s]?|port agent[s]?)\b/i,
    /\b(operador(?:es)? comercial(?:es)?|commercial operator[s]?|disponent owner[s]?)\b/i,
    /\b(chartering desk)\b/i,
  ];
  return patterns.some((p) => p.test(text));
}
