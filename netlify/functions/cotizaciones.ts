import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type QuoteRecord = {
  id: string;
  unique_reference: string;
  issue_date: string;
  calculation_data: unknown;
  freight: number | null;
  breakdown: unknown | null;
  created_at: string;
  updated_at: string;
};

const store = getStore({
  name: "cotizaciones",
  consistency: "strong",
});

const indexKey = "_index";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonHeaders = {
  ...corsHeaders,
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function jsonResponse(body: Record<string, unknown>, statusCode = 200) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function quoteKey(uniqueReference: string) {
  return `quotes/${encodeURIComponent(uniqueReference)}`;
}

async function readIndex() {
  const data = await store.get(indexKey, { type: "json" });
  return Array.isArray(data) ? data.filter((item): item is string => typeof item === "string") : [];
}

async function writeIndex(uniqueReference: string) {
  const existing = await readIndex();
  const next = [uniqueReference, ...existing.filter((item) => item !== uniqueReference)].slice(0, 500);
  await store.setJSON(indexKey, next);
}

function normalizeQuoteRow(row: QuoteRecord) {
  return {
    ...row,
    id: String(row.id),
    freight: row.freight === undefined || row.freight === null ? null : Number(row.freight),
  };
}

async function readQuote(uniqueReference: string) {
  return await store.get(quoteKey(uniqueReference), { type: "json" }) as QuoteRecord | null;
}

async function readLatestQuotes() {
  const references = await readIndex();
  const quotes = await Promise.all(references.map((reference) => readQuote(reference)));
  return quotes
    .filter((quote): quote is QuoteRecord => Boolean(quote))
    .sort((a, b) => {
      const updatedDiff = Date.parse(b.updated_at) - Date.parse(a.updated_at);
      return updatedDiff || b.id.localeCompare(a.id);
    })
    .slice(0, 500);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const uniqueReference = cleanText(event.queryStringParameters?.unique_reference);

      if (uniqueReference) {
        const quote = await readQuote(uniqueReference);

        return jsonResponse({
          success: true,
          data: quote ? normalizeQuoteRow(quote) : null,
        });
      }

      const rows = await readLatestQuotes();

      return jsonResponse({
        success: true,
        data: rows.map((row) => normalizeQuoteRow(row)),
      });
    }

    if (event.httpMethod === "POST") {
      const payload = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const uniqueReference = cleanText(payload.unique_reference || payload.uniqueReference);
      const issueDate = cleanText(payload.issue_date || payload.issueDate);
      const calculationData = payload.calculation_data || payload.calculationData;

      if (!uniqueReference || !issueDate || !calculationData || typeof calculationData !== "object") {
        return jsonResponse({
          success: false,
          error: "unique_reference, issue_date and calculation_data are required",
        }, 400);
      }

      const freight = Number(payload.freight);
      const freightValue = Number.isFinite(freight) ? freight : null;
      const breakdown = payload.breakdown && typeof payload.breakdown === "object" ? payload.breakdown : null;
      const existing = await readQuote(uniqueReference);
      const now = new Date().toISOString();
      const quote: QuoteRecord = {
        id: existing?.id || uniqueReference,
        unique_reference: uniqueReference,
        issue_date: issueDate,
        calculation_data: calculationData,
        freight: freightValue,
        breakdown,
        created_at: existing?.created_at || now,
        updated_at: now,
      };

      await store.setJSON(quoteKey(uniqueReference), quote);
      await writeIndex(uniqueReference);

      return jsonResponse({
        success: true,
        data: normalizeQuoteRow(quote),
      }, 201);
    }

    return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown storage error";
    return jsonResponse({ success: false, error: message }, 500);
  }
};
