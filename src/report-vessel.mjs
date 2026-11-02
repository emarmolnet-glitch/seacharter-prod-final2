// Presentation-only binding shared by the report and its schematic.
export function resolveReportVessel(data = {}) {
  const vessel = data.vessel && typeof data.vessel === 'object' ? data.vessel : {};
  const type = String(data.vesselType || vessel.type || data.vessel_type || data.tipoBuque || data.shipProfile || data.ship_profile || data.designCategory || data.design_category || data.categoriaDiseno || data.class || data.vesselClass || data.vessel_class || data.shipClass || 'Vessel type TBN');
  const pneumatic = /cement|pneumatic|neum[aá]tic/i.test(type);
  const rawName = String(data.vesselName || vessel.name || (typeof data.vessel === 'string' ? data.vessel : '') || 'MV TBN');
  const name = pneumatic && /^MV GEARED BULKER(?:\s*\(Handysize\))?$/i.test(rawName.trim()) ? 'MV TBN' : rawName;
  const dwt = Number(vessel.dwt ?? data.dwt ?? data.vesselDwt ?? 0);
  return { name, type, dwt, description: `${name} - ${type}${dwt > 0 ? ` (${dwt.toLocaleString('en-US')} DWT)` : ''}` };
}
