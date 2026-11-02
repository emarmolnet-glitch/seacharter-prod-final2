import '../fixture-operating-profile.js';

export function resolveReportVessel(data = {}) {
  const vessel = data.vessel && typeof data.vessel === 'object' ? data.vessel : {};
  const operation = globalThis.FixtureOperatingProfile.resolve(data);
  const type = operation.vesselType;
  const rawName = String(data.vesselName || vessel.name || (typeof data.vessel === 'string' ? data.vessel : '') || 'MV TBN');
  const name = !operation.isGeared && /^MV GEARED BULKER(?:\s*\(Handysize\))?$/i.test(rawName.trim()) ? 'MV TBN' : rawName;
  const dwt = Number(vessel.dwt ?? data.dwt ?? data.vesselDwt ?? 0);
  return { name, type, operationalType: type, dwt, description: `${name} - ${type}${dwt > 0 ? ` (${dwt.toLocaleString('en-US')} DWT)` : ''}` };
}

// Vessel operations override cargo-only boilerplate in the executive annex.
export function reportOperationalClauses(profile, isBagged = true) {
  if (profile === 'PNEUMATIC') return [
    'Pneumatic Equipment & Sealed Holds: gearless cement carrier; loading and discharging exclusively through airtight hoses and pneumatic equipment into sealed, dry holds.',
    'Owners shall maintain the pneumatic system and hold seals. Charterers shall ensure compatible terminal connections and provide qualified terminal operators.',
  ];
  if (profile === 'RORO') return [
    'Roll-on / roll-off operations via vessel ramps, subject to certified ramp SWL, axle loads, deck clearance and securing requirements.',
    'Stowage capacity shall be assessed by deck surface (m²) and lane metres using declared unit dimensions and weights. Charterers shall provide stevedores and lashing under Master’s supervision.',
  ];
  if ((profile === 'HANDYSIZE' || profile === 'SUPRAMAX') && !isBagged) return [
    'Geared operations: certified onboard cranes shall be used within their certified SWL. Break bulk shall use suitable slings, dunnage and lashing; Owners maintain serviceable gear and Charterers provide stevedores under Master’s supervision.',
  ];
  if (profile === 'HANDYSIZE' || profile === 'SUPRAMAX') return [
    'Geared operations: use of certified onboard cranes is mandatory within SWL. Sacks / big bags shall be handled with certified slings; grabs shall not be used on bagged cargo.',
    'Big bags shall be stowed on dry dunnage and secured against shifting. Owners shall maintain serviceable gear; Charterers shall provide stevedores, dunnage and lashing and remain responsible for handling damage under Master’s supervision.',
  ];
  return ['Gearless operations: terminal handling equipment and stowage arrangements shall be agreed before fixing.'];
}
