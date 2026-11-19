import { AisCoordinatorError, getLivePosition } from "./_shared/aisCoordinator.js";

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const imo = new URL(req.url).searchParams.get("imo");
    const result = await getLivePosition(imo);
    return Response.json({ success: true, ...result }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const controlled = error instanceof AisCoordinatorError;
    if (!controlled) console.error("[ais-live-position] Shadow AIS request failed.", error);
    let errorMessage = controlled ? error.message : "AIS live position request failed";
    let errorCode = controlled ? error.code : "AIS_INTERNAL_ERROR";
    if (errorMessage.includes("Datalastic")) {
      errorMessage = "No fue posible obtener posición AIS en vivo en este momento.";
      errorCode = "AIS_POSITION_UNAVAILABLE";
    }
    return Response.json({
      success: false,
      error: errorMessage,
      code: errorCode,
      details: controlled ? error.details : undefined,
    }, {
      status: controlled ? error.status : 500,
      headers: { "cache-control": "no-store" },
    });
  }
};
