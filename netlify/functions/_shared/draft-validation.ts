export const NGA_CARGO_DEPTH_METERS = Object.freeze({
  A: 21.6,
  B: 20.1,
  C: 18.6,
  D: 17.1,
  E: 15.5,
  F: 14.0,
  G: 12.5,
  H: 11.0,
  I: 9.4,
  J: 9.4,
  K: 7.9,
  L: 6.4,
  M: 4.9,
  N: 3.4,
  O: 0.0,
  P: 0.0,
  "": 0.0,
  " ": 0.0,
  UNKNOWN: 0.0,
} as const);

export type DraftValidationStatus = "CLEARED" | "OVERSIZED" | "DRAFT_REQUIRED" | "RISK_ACCEPTED";
export type DraftValidationBasis = "ACTUAL" | "MAXIMUM";

export interface DraftValidationResult {
  portName: string;
  portDepthCode: string;
  safeDepthMeters: number;
  vesselDraft: number;
  actualDraft: number | null;
  maxDraft: number | null;
  draftBasis: DraftValidationBasis;
  status: DraftValidationStatus;
  message: string;
  depthSource: "DATALASTIC" | "MANUAL" | "UNKNOWN";
  requiresManualDraft: boolean;
  riskAccepted: boolean;
}

type CargoDepthCode = keyof typeof NGA_CARGO_DEPTH_METERS;

function normalizeCargoDepthCode(value: unknown): CargoDepthCode {
  if (value === null || value === undefined) return "UNKNOWN";

  const uppercaseValue = String(value).toUpperCase();
  if (uppercaseValue in NGA_CARGO_DEPTH_METERS) {
    return uppercaseValue as CargoDepthCode;
  }

  const trimmedValue = uppercaseValue.trim();
  return trimmedValue in NGA_CARGO_DEPTH_METERS
    ? trimmedValue as CargoDepthCode
    : "UNKNOWN";
}

function firstPositiveDraft(...values: unknown[]) {
  for (const value of values) {
    const draft = Number(value);
    if (Number.isFinite(draft) && draft > 0) return draft;
  }
  return null;
}

export function validatePortDraft(input: {
  portName: string;
  portDepthCode?: unknown;
  safeDepthMeters?: unknown;
  depthSource?: "DATALASTIC" | "MANUAL";
  acceptUnknownDraft?: boolean;
  vesselDraft?: number;
  actualDraft?: number | null;
  calculatedDraft?: number | null;
  maxDraft?: number | null;
}): DraftValidationResult {
  const portDepthCode = normalizeCargoDepthCode(input.portDepthCode);
  const explicitSafeDepth = firstPositiveDraft(input.safeDepthMeters);
  const legacySafeDepth = NGA_CARGO_DEPTH_METERS[portDepthCode];
  const safeDepthMeters = explicitSafeDepth ?? (input.portDepthCode === undefined ? 0 : legacySafeDepth);
  const actualDraft = firstPositiveDraft(input.actualDraft, input.calculatedDraft);
  const maxDraft = firstPositiveDraft(input.maxDraft, input.vesselDraft);
  const draftBasis: DraftValidationBasis = actualDraft !== null ? "ACTUAL" : "MAXIMUM";
  const vesselDraft = actualDraft ?? maxDraft ?? 0;
  const hasSafeDepth = safeDepthMeters > 0;
  const riskAccepted = !hasSafeDepth && input.acceptUnknownDraft === true;
  const status: DraftValidationStatus = !hasSafeDepth
    ? (riskAccepted ? "RISK_ACCEPTED" : "DRAFT_REQUIRED")
    : vesselDraft > safeDepthMeters ? "OVERSIZED" : "CLEARED";
  const draftDescription = draftBasis === "ACTUAL"
    ? "calado operativo calculado"
    : "calado máximo del buque";

  const message = status === "CLEARED"
    ? `Calado OK: El ${draftDescription} (${vesselDraft.toFixed(2)} m) está dentro del calado operativo máximo de ${input.portName} (${safeDepthMeters.toFixed(2)} m).`
    : status === "OVERSIZED"
      ? `${input.portName}: el ${draftDescription} (${vesselDraft.toFixed(2)} m) supera el calado operativo máximo (${safeDepthMeters.toFixed(2)} m).`
      : status === "RISK_ACCEPTED"
        ? `${input.portName}: Datalastic no informó un calado operativo válido. El usuario aceptó continuar bajo riesgo operativo.`
        : `${input.portName}: Datalastic encontró el puerto y sus coordenadas, pero no informó un calado operativo válido. Introduce el calado manualmente o acepta el riesgo para continuar.`;

  return {
    portName: input.portName,
    portDepthCode,
    safeDepthMeters,
    vesselDraft,
    actualDraft,
    maxDraft,
    draftBasis,
    status,
    message,
    depthSource: explicitSafeDepth !== null ? (input.depthSource || "DATALASTIC") : "UNKNOWN",
    requiresManualDraft: status === "DRAFT_REQUIRED",
    riskAccepted,
  };
}
