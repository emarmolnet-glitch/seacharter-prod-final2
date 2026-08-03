export function buildCommercialVesselRank({
  vesselDwt,
  targetCargoDwt,
  laycanCompliant,
  transitHours,
  distanceNm,
}) {
  const dwt = Number(vesselDwt);
  const target = Number(targetCargoDwt);
  const hasDwtFit = Number.isFinite(dwt) && dwt > 0 && Number.isFinite(target) && target > 0;
  const dwtDifferenceMt = hasDwtFit ? Math.abs(dwt - target) : Number.POSITIVE_INFINITY;
  const similarityStepMt = Number.isFinite(target) && target > 0 ? Math.max(500, target * 0.05) : 500;
  const dwtSimilarityBand = Number.isFinite(dwtDifferenceMt)
    ? Math.floor(dwtDifferenceMt / similarityStepMt)
    : Number.MAX_SAFE_INTEGER;
  const laycanPriority = laycanCompliant === true ? 0 : laycanCompliant === false ? 2 : 1;
  const safeTransitHours = Number.isFinite(Number(transitHours)) && Number(transitHours) >= 0
    ? Number(transitHours)
    : Number.POSITIVE_INFINITY;
  const safeDistanceNm = Number.isFinite(Number(distanceNm)) && Number(distanceNm) >= 0
    ? Number(distanceNm)
    : Number.POSITIVE_INFINITY;
  const dwtFitPercent = hasDwtFit ? Math.max(0, 100 - (dwtDifferenceMt / target) * 100) : null;

  return {
    targetCargoDwt: Number.isFinite(target) && target > 0 ? target : null,
    vesselDwt: Number.isFinite(dwt) && dwt > 0 ? dwt : null,
    dwtDifferenceMt: Number.isFinite(dwtDifferenceMt) ? dwtDifferenceMt : null,
    dwtSimilarityBand,
    dwtFitPercent,
    laycanCompliant: laycanCompliant === true,
    laycanPriority,
    transitHours: Number.isFinite(safeTransitHours) ? safeTransitHours : null,
    distanceNm: Number.isFinite(safeDistanceNm) ? safeDistanceNm : null,
  };
}

export function compareCommercialVesselRanks(left, right) {
  return (left.dwtDifferenceMt ?? Number.POSITIVE_INFINITY) - (right.dwtDifferenceMt ?? Number.POSITIVE_INFINITY)
    || left.laycanPriority - right.laycanPriority
    || (left.transitHours ?? Number.POSITIVE_INFINITY) - (right.transitHours ?? Number.POSITIVE_INFINITY)
    || (left.distanceNm ?? Number.POSITIVE_INFINITY) - (right.distanceNm ?? Number.POSITIVE_INFINITY);
}
