export function getIndexForVessel(vesselType) {
  const normalizedVesselType = String(vesselType || '').trim().toUpperCase();

  if (normalizedVesselType.includes('CAPE')) return 'BCI';
  if (normalizedVesselType.includes('PANAMAX')) return 'BPI';
  if (normalizedVesselType.includes('SUPRAMAX')) return 'BSI';
  if (normalizedVesselType.includes('HANDY')) return 'BHSI';

  if (
    normalizedVesselType.includes('COASTER')
    || normalizedVesselType.includes('MINI-BULKER')
    || normalizedVesselType.includes('MINIBULKER')
  ) {
    return {
      type: 'REGIONAL',
      label: 'Mercado Regional / Short Sea (Cost-Plus)',
    };
  }

  return 'BDI';
}
