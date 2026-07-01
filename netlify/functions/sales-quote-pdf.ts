import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type SalesQuotePdfMetadata = {
  quoteId: string;
  fileName: string;
  customerName: string | null;
  carrierName: string | null;
  totalSellAmount: number | null;
  currency: string;
  createdAt: string;
  blobKey: string;
};

function cleanId(value: string | null) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const quoteId = cleanId(new URL(req.url).searchParams.get("quoteId"));
  if (!quoteId) {
    return Response.json({ success: false, error: "QuoteID obligatorio." }, { status: 400 });
  }

  const pdf = await req.arrayBuffer();
  if (!pdf.byteLength) {
    return Response.json({ success: false, error: "PDF vacío." }, { status: 400 });
  }

  const metadataHeader = req.headers.get("x-sales-quote-metadata");
  const incoming = metadataHeader ? JSON.parse(metadataHeader) : {};
  const createdAt = new Date().toISOString();
  const blobKey = `quotes/${quoteId}/${Date.now()}-sales-quote.pdf`;
  const fileName = cleanId(incoming.fileName || `${quoteId}_sales_quote.pdf`) || `${quoteId}_sales_quote.pdf`;
  const store = getStore({ name: "sales-quote-pdfs", consistency: "strong" });

  await store.set(blobKey, pdf);

  const indexKey = `quotes/${quoteId}/index.json`;
  const previousIndex = await store.get(indexKey, { type: "json" });
  const history = Array.isArray(previousIndex) ? previousIndex as SalesQuotePdfMetadata[] : [];
  const record: SalesQuotePdfMetadata = {
    quoteId,
    fileName,
    customerName: incoming.customerName || null,
    carrierName: incoming.carrierName || null,
    totalSellAmount: Number.isFinite(Number(incoming.totalSellAmount)) ? Number(incoming.totalSellAmount) : null,
    currency: incoming.currency || "EUR",
    createdAt,
    blobKey,
  };

  history.unshift(record);
  await store.setJSON(indexKey, history);

  return Response.json({ success: true, quoteId, fileName, blobKey, createdAt });
};

export const config: Config = {
  path: "/api/sales-quote-pdf",
};
