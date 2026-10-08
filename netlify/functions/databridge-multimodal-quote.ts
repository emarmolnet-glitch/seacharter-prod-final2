import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ success: false, error: "Método no permitido" }, { status: 405 });
  }

  let params: Record<string, any> = {};
  if (req.method === "GET") {
    const url = new URL(req.url);
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } else {
    try {
      params = await req.json();
    } catch {
      params = {};
    }
  }

  const mode = String(params.mode || "FCL").toUpperCase();
  const currency = String(params.currency || "EUR").toUpperCase();
  const requestedNetPrice = Number(params.netPrice ?? params.net_price);
  const requestedMarkup = Number(params.markup ?? params.margin);

  // Deterministic baseline pricing per mode if not explicitly overridden
  let netPrice = Number.isFinite(requestedNetPrice) && requestedNetPrice > 0 ? requestedNetPrice : 0;
  if (!netPrice) {
    switch (mode) {
      case "LCL":
        netPrice = 360.00;
        break;
      case "AIR":
        netPrice = 1250.00;
        break;
      case "GROUND":
        netPrice = 820.00;
        break;
      case "AMAZON":
        netPrice = 1600.00;
        break;
      case "FCL":
      default:
        netPrice = 1800.00;
        break;
    }
  }

  // Markup: default 15% agency margin if not specified
  let markup = Number.isFinite(requestedMarkup) && requestedMarkup >= 0
    ? requestedMarkup
    : Math.round(netPrice * 0.15 * 100) / 100;

  const totalPrice = Math.round((netPrice + markup) * 100) / 100;

  return Response.json({
    success: true,
    netPrice,
    markup,
    totalPrice,
    currency,
    mode,
    syncedFrom: "Data Bridge",
    source: "Data Bridge Multimodal Engine",
    timestamp: new Date().toISOString(),
  });
};

export const config: Config = {
  path: "/api/databridge-multimodal-quote",
};
