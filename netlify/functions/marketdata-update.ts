import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type MarketIndices = {
  bunkerPrice: number;
  eurUsdRate: number;
  inflationIndex: number;
};

type StoredMarketReferenceData = MarketIndices & {
  id: string;
  updatedAtUtc: string;
};

const MARKET_DATA_STORE = "market-reference-data";
const CURRENT_MARKET_DATA_KEY = "current";

function simulatedFinancialApiResponse(): MarketIndices {
  return {
    bunkerPrice: 642.75,
    eurUsdRate: 1.0835,
    inflationIndex: 0.0325,
  };
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const updatedAt = new Date();
  const indices = simulatedFinancialApiResponse();
  const referenceData: StoredMarketReferenceData = {
    id: CURRENT_MARKET_DATA_KEY,
    bunkerPrice: indices.bunkerPrice,
    eurUsdRate: indices.eurUsdRate,
    inflationIndex: indices.inflationIndex,
    updatedAtUtc: updatedAt.toISOString(),
  };

  const store = getStore({ name: MARKET_DATA_STORE, consistency: "strong" });
  await store.setJSON(CURRENT_MARKET_DATA_KEY, referenceData);

  console.info("Market indices updated", {
    updatedAtUtc: updatedAt.toISOString(),
    bunkerPrice: indices.bunkerPrice,
    eurUsdRate: indices.eurUsdRate,
    inflationIndex: indices.inflationIndex,
  });

  return Response.json({
    success: true,
    data: referenceData,
  });
};

export const config: Config = {
  path: "/api/marketdata/update",
};
