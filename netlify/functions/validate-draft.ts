import type { Config } from "@netlify/functions";
import { DatalasticPortError, findDatalasticPorts, getDatalasticPort } from "./_shared/datalastic-port-client.js";
import { validatePortDraft } from "./_shared/draft-validation.js";
import { getOrSetCachedJson } from "./_shared/response-cache.js";

interface ValidateDraftRequestBody {
  portName?: unknown;
  portUuid?: unknown;
  portUnlocode?: unknown;
  vesselDraft?: unknown;
  actualDraft?: unknown;
  calculatedDraft?: unknown;
  maxDraft?: unknown;
  manualPortDraft?: unknown;
  acceptUnknownDraft?: unknown;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstPositiveDraft(...values: unknown[]) {
  for (const value of values) {
    const draft = Number(value);
    if (Number.isFinite(draft) && draft > 0) return draft;
  }
  return null;
}

export default async function validateDraftHandler(request: Request) {
  if (request.method !== "POST") return Response.json({ error: "Método no permitido." }, { status: 405 });

  let body: ValidateDraftRequestBody;
  try {
    body = await request.json() as ValidateDraftRequestBody;
  } catch {
    return Response.json({ error: "El body debe ser un JSON válido." }, { status: 400 });
  }

  const portName = cleanText(body.portName);
  const portUuid = cleanText(body.portUuid);
  const portUnlocode = cleanText(body.portUnlocode).toUpperCase();
  const actualDraft = firstPositiveDraft(body.actualDraft, body.calculatedDraft);
  const maxDraft = firstPositiveDraft(body.maxDraft, body.vesselDraft);
  const manualPortDraft = firstPositiveDraft(body.manualPortDraft);
  if (!portName && !portUuid && !portUnlocode) {
    return Response.json({ error: "Debe indicarse el puerto activo para validar el calado." }, { status: 400 });
  }
  if (actualDraft === null && maxDraft === null) {
    return Response.json({ error: "Debe indicarse un calado actual calculado o un calado máximo válido." }, { status: 400 });
  }

  try {
    const cacheKey = portUuid || portUnlocode || portName.toLowerCase();
    const cached = await getOrSetCachedJson({
      namespace: "datalastic-port-info-v1",
      key: cacheKey,
      ttlMs: 30 * 24 * 60 * 60 * 1000,
      staleTtlMs: 90 * 24 * 60 * 60 * 1000,
      producer: () => getDatalasticPort({ uuid: portUuid, unlocode: portUnlocode, name: portName }),
    });
    const port = cached.value;
    if (!port) return Response.json({ error: "Datalastic no encontró el puerto solicitado." }, { status: 404 });

    let providerDraft = firstPositiveDraft(port.maxOperationalDraftMeters);
    if (providerDraft === null && portName) {
      const finderCache = await getOrSetCachedJson({
        namespace: "datalastic-port-finder-v1",
        key: portName.toLowerCase(),
        ttlMs: 7 * 24 * 60 * 60 * 1000,
        staleTtlMs: 30 * 24 * 60 * 60 * 1000,
        producer: () => findDatalasticPorts(portName),
      });
      const finderPort = finderCache.value.find((candidate) => (
        (port.uuid && candidate.uuid === port.uuid)
        || (port.unlocode && candidate.unlocode === port.unlocode)
      )) || finderCache.value[0];
      providerDraft = firstPositiveDraft(finderPort?.maxOperationalDraftMeters);
    }
    return Response.json({
      ...validatePortDraft({
        portName: port.portName,
        safeDepthMeters: manualPortDraft ?? providerDraft,
        depthSource: manualPortDraft ? "MANUAL" : "DATALASTIC",
        actualDraft,
        maxDraft,
        acceptUnknownDraft: body.acceptUnknownDraft === true,
      }),
      portUuid: port.uuid,
      portUnlocode: port.unlocode,
      latitude: port.latitude,
      longitude: port.longitude,
      officialLabel: port.officialLabel,
      providerDraftMeters: providerDraft,
      manualPortDraftMeters: manualPortDraft,
      draftSourceField: port.draftSourceField,
      source: port.source,
    });
  } catch (error) {
    console.error("[validate-draft] Datalastic validation failed.", error instanceof Error ? error.message : String(error));
    const status = error instanceof DatalasticPortError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible validar el calado." }, { status });
  }
}

export const config: Config = {
  path: "/api/v1/ports/validate-draft",
};
