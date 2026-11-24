export declare const STANDARD_SEAWATER_DENSITY: number;
export declare const BRACKISH_WATER_DENSITY_THRESHOLD: number;
export declare const DEFAULT_PORT_RESTRICTION_BUFFER_DAYS: number;
export declare const ESTIMATED_WATERPLANE_COEFFICIENT: number;

export type PortH16Profile = {
  hasSheet: boolean;
  hasData: boolean;
  dataConfidence: string | null;
  effectiveDraftM: number | null;
  effectiveDraftSource: "channel_high" | "berth" | "channel_low" | null;
  effectiveDraftLabel: string | null;
  lowWaterDraftM: number | null;
  berthDraftM: number | null;
  channelDraftHighM: number | null;
  channelDraftLowM: number | null;
  maxLoaM: number | null;
  maxBeamM: number | null;
  waterDensity: number | null;
  tidalRangeM: number | null;
  tidalWindowRequired: boolean | null;
  nightNavigationAllowed: boolean | null;
  gearedVesselRequired: boolean | null;
  operationalWarnings: string[];
};

export declare function parseH16PortSheet(raw: unknown): Record<string, unknown> | null;
export declare function resolvePortH16Profile(input: unknown): PortH16Profile;
export declare function buildPortH16Badges(profile: PortH16Profile): Array<{ key: string; label: string; tone: string }>;
export declare function adjustDraftForWaterDensity(draftM: unknown, waterDensity: unknown): number | null;
export declare function evaluateVesselPortFit(profile: PortH16Profile, vessel?: Record<string, unknown>, options?: Record<string, unknown>): Record<string, any>;
export declare function evaluateRoutePortRestrictions(ports?: Array<{ role: string; name: string; port: unknown }>, vessel?: Record<string, unknown>, options?: Record<string, unknown>): Record<string, any>;
