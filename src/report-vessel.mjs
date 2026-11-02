// Presentation-only binding shared by the report and its schematic.
export function resolveReportVessel(data = {}) {
  const vessel = data.vessel && typeof data.vessel === 'object' ? data.vessel : {};
  const type = String(vessel.type || data.vesselType || data.shipProfile || data.ship_profile || data.designCategory || data.categoriaDiseno || data.class || data.vesselClass || 'Vessel type TBN');
  const pneumatic = /cement|pneumatic|neum[aá]tic/i.test(type);
  const rawName = String(vessel.name || data.vesselName || (typeof data.vessel === 'string' ? data.vessel : '') || 'MV TBN');
  const name = pneumatic && /^MV GEARED BULKER(?:\s*\(Handysize\))?$/i.test(rawName.trim()) ? 'MV TBN' : rawName;
  const dwt = Number(vessel.dwt ?? data.dwt ?? data.vesselDwt ?? 0);
  return { name, type, dwt, description: `${name} - ${type}${dwt > 0 ? ` (${dwt.toLocaleString('en-US')} DWT)` : ''}` };
}
