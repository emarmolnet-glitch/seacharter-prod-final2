export function cleanNumberString(val) {
  if (val === null || val === undefined) return null;
  let s = String(val).trim();
  if (/^\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?$/.test(s)) {
    if (s.includes(",") && !s.includes(".")) {
      s = s.replace(/,/g, "");
    } else if (s.includes(".") && !s.includes(",")) {
      s = s.replace(/\./g, "");
    } else {
      s = s.replace(/,/g, "");
    }
  } else {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export const MARITIME_FLAG_MAP = Object.freeze({
  "ANTIGUA & BARBUDA": "AG",
  "ANTIGUA AND BARBUDA": "AG",
  "ANTIGUA": "AG",
  "PANAMA": "PA",
  "LIBERIA": "LR",
  "MARSHALL ISLANDS": "MH",
  "MARSHALL IS": "MH",
  "MALTA": "MT",
  "BAHAMAS": "BS",
  "CYPRUS": "CY",
  "SINGAPORE": "SG",
  "HONG KONG": "HK",
  "HONG KONG CHINA": "HK",
  "PORTUGAL": "PT",
  "MADEIRA": "PT",
  "SPAIN": "ES",
  "ESPAÑA": "ES",
  "ESPANA": "ES",
  "ALGERIA": "DZ",
  "ARGELIA": "DZ",
  "NETHERLANDS": "NL",
  "HOLLAND": "NL",
  "GERMANY": "DE",
  "GREECE": "GR",
  "TURKEY": "TR",
  "TURKIYE": "TR",
  "NORWAY": "NO",
  "DENMARK": "DK",
  "CHINA": "CN",
  "JAPAN": "JP",
  "UNITED KINGDOM": "GB",
  "UK": "GB",
  "GREAT BRITAIN": "GB",
  "UNITED STATES": "US",
  "USA": "US",
  "ITALY": "IT",
  "FRANCE": "FR",
  "BELIZE": "BZ",
  "PALAU": "PW",
  "BARBADOS": "BB",
  "ST KITTS": "KN",
  "SAINT KITTS": "KN",
  "ST KITTS & NEVIS": "KN",
  "ST KITTS AND NEVIS": "KN",
  "ST VINCENT": "VC",
  "SAINT VINCENT": "VC",
  "ST VINCENT & THE GRENADINES": "VC",
  "ST VINCENT AND THE GRENADINES": "VC",
  "COMOROS": "KM",
  "SIERRA LEONE": "SL",
  "TOGO": "TG",
  "COOK ISLANDS": "CK",
  "LUXEMBOURG": "LU",
  "ISLE OF MAN": "IM",
  "GIBRALTAR": "GI",
  "BERMUDA": "BM",
  "CAYMAN ISLANDS": "KY",
  "CAYMAN IS": "KY",
  "VANUATU": "VU",
  "CURACAO": "CW",
  "PHILIPPINES": "PH",
  "INDIA": "IN",
  "INDONESIA": "ID",
  "BRAZIL": "BR",
  "SWEDEN": "SE",
  "FINLAND": "FI",
  "TAIWAN": "TW",
  "RUSSIA": "RU",
});

export function normalizeFlagCode(rawFlag) {
  if (!rawFlag || typeof rawFlag !== "string") return null;
  const trimmed = rawFlag.trim();
  if (!trimmed) return null;

  // 1. If already 2 or 3 letters, return uppercase
  if (/^[A-Za-z]{2,3}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // 2. Direct lookup in maritime flag map
  const upper = trimmed.toUpperCase().replace(/\s+/g, " ");
  if (MARITIME_FLAG_MAP[upper]) {
    return MARITIME_FLAG_MAP[upper];
  }

  // 3. Normalized key lookup
  const normalizedKey = upper
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "");

  for (const [k, v] of Object.entries(MARITIME_FLAG_MAP)) {
    const kNorm = k
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, "AND")
      .replace(/[^A-Z0-9]+/g, "");
    if (kNorm === normalizedKey) {
      return v;
    }
  }

  // 4. If no match and length > 3: return null (NEVER send > 3 characters to flag column)
  if (trimmed.length > 3) {
    return null;
  }

  return trimmed.slice(0, 3).toUpperCase();
}

export function parseDeterministicParticulars(rawText, vesselNameHint = "") {
  const text = String(rawText || "").trim();
  if (!text && !vesselNameHint) return null;

  // 1. IMO (7 digits)
  let imoNumber = null;
  const explicitImoMatch = text.match(/\b(?:IMO|I\.M\.O\.?|IMO\s*NO\.?|IMO\s*NUMBER|IMO#)\s*[:#=\-\s]?\s*([0-9]{7})\b/i) ||
                          text.match(/\bIMO\D{0,5}([0-9]{7})\b/i);
  if (explicitImoMatch) {
    imoNumber = explicitImoMatch[1];
  } else {
    const isolatedImoMatch = text.match(/\b([89]\d{6})\b/) || text.match(/\b(\d{7})\b/);
    if (isolatedImoMatch) {
      imoNumber = isolatedImoMatch[1];
    } else if (vesselNameHint && /^\d{7}$/.test(vesselNameHint.trim())) {
      imoNumber = vesselNameHint.trim();
    }
  }

  // 2. Vessel Name
  let vesselName = null;
  const nameMatch = text.match(/(?:M\/V|MV|M\.V\.|M\/T|MT|M\.T\.|VESSEL(?:\s*NAME)?|NAME|BUQUE)\s*[:=\-]?\s*([A-Za-z0-9\s\.\-_/]+?)(?=\s*[,;\n\r\t]|\s+(?:IMO|BUILT|BLT|DWT|FLAG|LOA|BEAM|YEAR|DWCC)|$)/i);
  if (nameMatch && nameMatch[1].trim()) {
    vesselName = nameMatch[1].trim().replace(/^(?:M\/V|MV|M\.V\.|M\/T|MT)\s+/i, "");
  } else {
    const firstLine = text.split(/[\r\n]+/)[0]?.trim();
    if (firstLine && /^(?:M\/V|MV)\s+[A-Za-z0-9\s\.\-_]+$/i.test(firstLine)) {
      vesselName = firstLine.replace(/^(?:M\/V|MV)\s+/i, "").trim();
    } else if (vesselNameHint && !/^\d{7}$/.test(vesselNameHint.trim())) {
      vesselName = vesselNameHint.trim();
    }
  }

  // 3. DWT
  let dwt = null;
  const dwtMatch = text.match(/\b(?:DWT|DEADWEIGHT|PESO\s*MUERTO|DWAT)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,3}(?:[,\.][0-9]{3})+|[0-9]{3,6})(?:\.[0-9]+)?/i) ||
                  text.match(/\b([0-9]{1,3}(?:[,\.][0-9]{3})+|[0-9]{4,6})\s*(?:MTS?|MT|T|TONS?|TONNES?)\s*(?:DWT|DEADWEIGHT)\b/i) ||
                  text.match(/\b([0-9]{1,3}(?:[,\.][0-9]{3})+|[0-9]{4,6})\s*DWT\b/i);
  if (dwtMatch) dwt = cleanNumberString(dwtMatch[1]);

  // 4. DWCC
  let dwcc = null;
  const dwccMatch = text.match(/\b(?:DWCC|D\.W\.C\.C\.)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,3}(?:[,\.][0-9]{3})+|[0-9]{3,6})(?:\.[0-9]+)?/i);
  if (dwccMatch) dwcc = cleanNumberString(dwccMatch[1]);

  // 5. Year built
  let yearBuilt = null;
  const yearMatch = text.match(/\b(?:BUILT|BLT|AÑO(?: DE CONSTRUCCI[OÓ]N)?|YEAR\s*BUILT|YR\s*BLT|CONSTRUCTION)\s*[:=]?\s*(?:ABT\s*)?(19[5-9]\d|20[0-2]\d)\b/i);
  if (yearMatch) yearBuilt = parseInt(yearMatch[1], 10);

  // 6. GT / NT
  let grossTonnage = null;
  let netTonnage = null;
  const gtNtMatch = text.match(/(?:GT\s*\/\s*NT|GRT\s*\/\s*NRT)\s*[:=]?\s*([0-9,.]+)\s*(?:MTS?|MT|T)?\s*\/\s*([0-9,.]+)/i);
  if (gtNtMatch) {
    grossTonnage = cleanNumberString(gtNtMatch[1]);
    netTonnage = cleanNumberString(gtNtMatch[2]);
  } else {
    const gtMatch = text.match(/\b(?:GT|GRT|GROSS\s*TONNAGE)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,3}(?:[,\.][0-9]{3})+|[0-9]{3,6})/i);
    if (gtMatch) grossTonnage = cleanNumberString(gtMatch[1]);
    const ntMatch = text.match(/\b(?:NT|NRT|NET\s*TONNAGE)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,3}(?:[,\.][0-9]{3})+|[0-9]{3,6})/i);
    if (ntMatch) netTonnage = cleanNumberString(ntMatch[1]);
  }

  // 7. LOA / Beam
  let loaMeters = null;
  let beamMeters = null;
  const loaBeamMatch = text.match(/(?:LOA\s*\/\s*BEAM)\s*[:=]?\s*([0-9]{2,3}(?:[,\.][0-9]+)?)\s*M?\s*\/\s*([0-9]{1,2}(?:[,\.][0-9]+)?)/i);
  if (loaBeamMatch) {
    loaMeters = cleanNumberString(loaBeamMatch[1]);
    beamMeters = cleanNumberString(loaBeamMatch[2]);
  } else {
    const loaMatch = text.match(/\b(?:LOA|LENGTH\s*OVERALL|ESLORA)\s*[:=]?\s*(?:ABT\s*)?([0-9]{2,3}(?:[,\.][0-9]+)?)\s*(?:M|METERS?|METRES?)?\b/i);
    if (loaMatch) loaMeters = cleanNumberString(loaMatch[1]);
    const beamMatch = text.match(/\b(?:BEAM|WIDTH|MANGA|BREADTH)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:M|METERS?|METRES?)?\b/i);
    if (beamMatch) beamMeters = cleanNumberString(beamMatch[1]);
  }

  // 8. Draft
  let draftMeters = null;
  const draftMatch = text.match(/\b(?:DRAFT|DRAUGHT|CALADO)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:M|METERS?|METRES?|SSW)?\b/i) ||
                    text.match(/\bON\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*M(?:\s*SSW)?\b/i);
  if (draftMatch) draftMeters = cleanNumberString(draftMatch[1]);

  // 9. Speeds (Ballast & Laden)
  let spdBallast = null;
  let spdLaden = null;
  const spdBallastMatch = text.match(/\b(?:BALLAST|BAL)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:KTS?|KNOTS?|KT)?/i);
  if (spdBallastMatch) spdBallast = cleanNumberString(spdBallastMatch[1]);
  const spdLadenMatch = text.match(/\b(?:LADEN|LAD)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:KTS?|KNOTS?|KT)?/i);
  if (spdLadenMatch) spdLaden = cleanNumberString(spdLadenMatch[1]);

  if (!spdBallast && !spdLaden) {
    const combinedSpdMatch = text.match(/\b(?:SPEED|SPD|VEL(?:OCIDAD)?)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*\/\s*([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:KTS?|KNOTS?|KT)?/i);
    if (combinedSpdMatch) {
      spdBallast = cleanNumberString(combinedSpdMatch[1]);
      spdLaden = cleanNumberString(combinedSpdMatch[2]);
    } else {
      const singleSpeedWithConsMatch = text.match(/\b([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:kts?|knots?|kt)\s+(?:on|with)\s+([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:mt|t)/i);
      if (singleSpeedWithConsMatch) {
        const spd = cleanNumberString(singleSpeedWithConsMatch[1]);
        spdBallast = spd;
        spdLaden = spd;
      } else {
        const singleSpdMatch = text.match(/\b(?:SPEED|SPD|VEL(?:OCIDAD)?)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:KTS?|KNOTS?|KT)\b/i);
        if (singleSpdMatch) {
          const spd = cleanNumberString(singleSpdMatch[1]);
          spdBallast = spd;
          spdLaden = spd;
        }
      }
    }
  } else if (spdBallast && !spdLaden) {
    spdLaden = spdBallast;
  } else if (!spdBallast && spdLaden) {
    spdBallast = spdLaden;
  }

  // 10. Consumptions
  let consSea = null;
  let consPort = null;
  const seaConsMatch = text.match(/\b(?:SEA\s*CONS|CONS\s*SEA|AT\s*SEA|CONSUMPTION\s*AT\s*SEA|CONSUMO\s*(?:EN\s*)?MAR|CONS\s*MAR)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:MTS?|MT|T|TONS?|T\/D|MT\/DAY)?\b/i);
  if (seaConsMatch) {
    consSea = cleanNumberString(seaConsMatch[1]);
  } else {
    const singleSpeedWithConsMatch = text.match(/\b([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:kts?|knots?|kt)\s+(?:on|with)\s+([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:mt|t)/i);
    if (singleSpeedWithConsMatch) {
      consSea = cleanNumberString(singleSpeedWithConsMatch[2]);
    } else {
      const ladenConsMatch = text.match(/LADEN[^\n\r]*?\bON\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:MTS?|MT|T)/i);
      if (ladenConsMatch) {
        consSea = cleanNumberString(ladenConsMatch[1]);
      } else {
        const generalConsMatch = text.match(/\b(?:ON|CONS(?:UMPTION)?|CONSUMO)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:MTS?|MT|T|TONS?|T\/D|MT\/DAY)\s*(?:VLSFO|IFO|MGO|HFO|LSMGO)?\b/i);
        if (generalConsMatch) consSea = cleanNumberString(generalConsMatch[1]);
      }
    }
  }

  const portConsMatch = text.match(/\b(?:IN\s*PORT|PORT\s*CONS|CONS\s*PORT|PORT|PUERTO|IDLE|CONSUMO\s*(?:EN\s*)?PUERTO|CONS\s*PUERTO)\s*[:=]?\s*(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:MTS?|MT|T|TONS?|T\/D|MT\/DAY)?\b/i) ||
                        text.match(/(?:PORT|IDLE|PUERTO)[^\n\r]*?(?:ABT\s*)?([0-9]{1,2}(?:[,\.][0-9]+)?)\s*(?:MTS?|MT|T)/i);
  if (portConsMatch) consPort = cleanNumberString(portConsMatch[1]);

  // 11. Flag
  let flag = null;
  const flagMatch = text.match(/\b(?:FLAG|BANDERA|PABELLON)\s*[:=\-]?\s*([A-Za-z\s]{3,25})(?=\s*[,;\n\r\t\-]|\s+(?:BUILT|BLT|DWT|IMO|YEAR)|$)/i);
  if (flagMatch) flag = flagMatch[1].trim();

  // 12. Vessel type / Class
  let vesselType = null;
  if (/BULK\s*CARRIER|BULKER/i.test(text)) vesselType = "Bulk Carrier";
  else if (/GENERAL\s*CARGO|MPP|MULTI[- ]PURPOSE/i.test(text)) vesselType = "General Cargo";
  else if (/CONTAINER/i.test(text)) vesselType = "Container";
  else if (/TANKER|CHEMICAL|PRODUCT/i.test(text)) vesselType = "Tanker";
  else if (/CEMENT/i.test(text)) vesselType = "Cement Carrier";
  else if (/COASTER/i.test(text)) vesselType = "Coaster";
  else if (dwt) {
    if (dwt < 10000) vesselType = "Coaster";
    else if (dwt < 25000) vesselType = "Handysize";
    else if (dwt < 40000) vesselType = "Handymax";
    else if (dwt < 65000) vesselType = "Supramax";
    else if (dwt < 100000) vesselType = "Panamax";
    else vesselType = "Capesize";
  }

  return {
    vessel_name: vesselName,
    imo_number: imoNumber,
    year_built: yearBuilt,
    dwt: dwt,
    dwcc: dwcc,
    vessel_type: vesselType,
    gross_tonnage: grossTonnage,
    net_tonnage: netTonnage,
    loa_meters: loaMeters,
    beam_meters: beamMeters,
    draft_meters: draftMeters,
    spd_ballast: spdBallast,
    spd_laden: spdLaden,
    cons_sea: consSea,
    cons_port: consPort,
    flag: flag
  };
}
