export type CommercialVesselRank = {
  targetCargoDwt: number | null;
  vesselDwt: number | null;
  dwtDifferenceMt: number | null;
  dwtSimilarityBand: number;
  dwtFitPercent: number | null;
  estimatedBallastStatus: boolean;
  ballastPriority: number;
  laycanCompliant: boolean;
  laycanPriority: number;
  transitHours: number | null;
  distanceNm: number | null;
};

export function buildCommercialVesselRank(input: {
  vesselDwt?: unknown;
  targetCargoDwt?: unknown;
  estimatedBallastStatus?: unknown;
  laycanCompliant?: unknown;
  transitHours?: unknown;
  distanceNm?: unknown;
}): CommercialVesselRank;

export function compareCommercialVesselRanks(
  left: CommercialVesselRank,
  right: CommercialVesselRank,
): number;
