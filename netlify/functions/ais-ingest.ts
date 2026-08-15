import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  return Response.json({
    success: false,
    error: "AISSTREAM_BACKEND_DISABLED",
    message: "AISStream se ejecuta exclusivamente en el navegador para el MMSI activo de Tracking. Radar utiliza exclusivamente Datalastic.",
  }, {
    status: 410,
    headers: { "cache-control": "no-store" },
  });
};

export const config: Config = {
  path: "/api/ais/ingest",
  method: ["GET", "POST"],
};
