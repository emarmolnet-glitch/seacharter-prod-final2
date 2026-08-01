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

export type DraftValidationStatus = "CLEARED" | "OVERSIZED";

export interface DraftValidationResult {
  portName: string;
  portDepthCode: string;
  safeDepthMeters: number;
  vesselDraft: number;
  status: DraftValidationStatus;
  message: string;
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

export function validatePortDraft(input: {
  portName: string;
  portDepthCode: unknown;
  vesselDraft: number;
}): DraftValidationResult {
  const portDepthCode = normalizeCargoDepthCode(input.portDepthCode);
  const safeDepthMeters = NGA_CARGO_DEPTH_METERS[portDepthCode];
  const status: DraftValidationStatus = input.vesselDraft > safeDepthMeters
    ? "OVERSIZED"
    : "CLEARED";

  const message = status === "CLEARED"
    ? `${input.portName}: el calado del buque (${input.vesselDraft.toFixed(1)} m) está dentro del límite seguro NGA (${safeDepthMeters.toFixed(1)} m).`
    : `${input.portName}: el calado del buque (${input.vesselDraft.toFixed(1)} m) supera el límite seguro NGA (${safeDepthMeters.toFixed(1)} m).`;

  return {
    portName: input.portName,
    portDepthCode,
    safeDepthMeters,
    vesselDraft: input.vesselDraft,
    status,
    message,
  };
}
