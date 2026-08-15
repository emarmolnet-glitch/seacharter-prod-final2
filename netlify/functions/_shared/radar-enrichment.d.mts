export type RadarVessel = Record<string, unknown>;

export type RadarEnrichmentResult = {
  vessels: RadarVessel[];
  counts: {
    liveRadar: number;
    technicalMatches: number;
  };
};

export function radarIdentity(vessel: RadarVessel): { imo: string; mmsi: string };
export function mergeRadarTechnicalData(vessels: RadarVessel[], masterRows?: RadarVessel[]): RadarEnrichmentResult;
export function enrichDatalasticRadarVessels(vessels: RadarVessel[]): Promise<RadarEnrichmentResult>;
