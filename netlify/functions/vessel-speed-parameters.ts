const VESSEL_SPEED_PARAMETERS = [
  { segment: "Coaster", minDwt: 0, maxDwt: 4999, speedBallast: 10.0, speedLaden: 9.0, sampleSize: 18 },
  { segment: "Mini-Bulker", minDwt: 5000, maxDwt: 14999, speedBallast: 10.8, speedLaden: 9.8, sampleSize: 24 },
  { segment: "Handysize", minDwt: 15000, maxDwt: 39999, speedBallast: 11.5, speedLaden: 10.5, sampleSize: 42 },
  { segment: "Supramax", minDwt: 40000, maxDwt: 59999, speedBallast: 12.0, speedLaden: 11.0, sampleSize: 37 },
  { segment: "Ultramax", minDwt: 60000, maxDwt: 64999, speedBallast: 12.2, speedLaden: 11.2, sampleSize: 21 },
  { segment: "Panamax", minDwt: 65000, maxDwt: 84999, speedBallast: 12.5, speedLaden: 11.5, sampleSize: 19 },
  { segment: "Capesize", minDwt: 85000, maxDwt: null, speedBallast: 13.0, speedLaden: 12.0, sampleSize: 13 },
];

function detectVesselSegment(dwt: number) {
  return (
    VESSEL_SPEED_PARAMETERS.find((row) => dwt >= row.minDwt && (row.maxDwt === null || dwt <= row.maxDwt)) ||
    VESSEL_SPEED_PARAMETERS[0]
  );
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

export default async (request: Request) => {
  const url = new URL(request.url);
  const dwt = Number(url.searchParams.get("dwt") || "0");

  if (!Number.isFinite(dwt) || dwt <= 0) {
    return json({ error: "DWT must be a positive number" }, 400);
  }

  const parameters = detectVesselSegment(dwt);

  return json({
    dwt,
    segment: parameters.segment,
    speedBallast: parameters.speedBallast,
    speedLaden: parameters.speedLaden,
    source: "SeaCharter Core PRO historical fleet average",
    sampleSize: parameters.sampleSize,
    inferred: true,
  });
};

export const config = {
  path: "/api/vessel-speed-parameters",
};
