declare const process: { env: Record<string, string | undefined> };

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getAisStreamApiKey() {
  return String(process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY || "").trim();
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const apiKey = getAisStreamApiKey();
  if (!apiKey) {
    return Response.json(
      { success: false, error: "AISSTREAM_API_KEY is not configured" },
      { status: 500, headers },
    );
  }

  return Response.json({ success: true, apiKey }, { headers });
};
