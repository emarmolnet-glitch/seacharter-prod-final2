type AnyRecord = Record<string, unknown>;

const STRICT_EXCLUDED_PATTERN = /\b(fishing|pesquero|pesca|trawler|trawl|drifter|seiner|longliner|fish factory|pesquero de arrastre|tug|tugboat|remolcador|remolque|towing|towage|pusher|pushboat|empujador|escort tug|support vessel|passenger|cruise|ferry|ropax|ro-pax|pasaje|pasajeros|crucero|pleasure craft|pleasure|recreational|recreo|yacht|superyacht|megayacht|yate|sailing|sailing vessel|sailboat|velero|sport fishing|dredger|dredging|draga|dragado|manned vts|vts|port hand mark|starboard hand mark|special mark|sea farm|special mark - sea farm|reference point|isolated danger|navigation mark|buoy|boya|baliza|military ops|military|warship|navy|patrol|patrullera|search and rescue|search & rescue|sar|rescue vessel|rescue|salvage|salvamento|guardacostas|coast guard|port service|servicio portuario|workboat|barco de trabajo|crew boat|pilot|pilot boat|prácticos|tender|port tender|diving|buceo|pontoon|ponton|anti-pollution|oil recovery|cable layer|pipe layer|research vessel|investigación|drillship|drilling|offshore supply|platform supply|platform|psv|ahts|other|unknown|desconocido|otros)\b/i;

const STRICT_CARGO_PATTERN = /\b(bulk carrier|bulker|dry bulk|dry cargo|granelero|graneles|capesize|post-panamax|kamsarmax|panamax|ultramax|supramax|handymax|handysize|mini bulker|minibulker|mini-bulker|ore carrier|grain carrier|collier|wood chips carrier|self-unloading bulker|self unloader|general cargo|general cargo vessel|carguero|buque de carga|cargo ship|cargo|coaster|coastal cargo|cabotage|cabotaje|costero|freighter|merchant|motor vessel|mv|multipurpose|multi purpose|multi-purpose|mpp|mpv|mmpp|open hatch|box hold|multipropósito|container ship|container|containership|feeder|boxship|portacontenedores|heavy load carrier|heavy lift|heavy load|heavy carrier|project cargo|carga pesada|break bulk|breakbulk|break-bulk|ro-ro cargo|roro cargo|ro-ro|roro|vehicle carrier|car carrier|cement carrier|cementero|cement|cemento|clinker carrier|clinker)\b/i;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

export function validImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? digits : "";
}

export function validMmsi(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

export function readAisType(value: unknown) {
  const vessel = asRecord(value);
  const metadata = asRecord(vessel.MetaData || vessel.metadata);
  const message = asRecord(vessel.Message);
  const staticData = asRecord(vessel.ShipStaticData || message.ShipStaticData);
  const nestedVessel = asRecord(vessel.vessel);
  const nestedAis = asRecord(vessel.ais || vessel.AIS);
  const sourcePayload = asRecord(vessel.source_payload || vessel.sourcePayload);
  const sourceMetadata = asRecord(sourcePayload.MetaData || sourcePayload.metadata);
  const rawTypes = [
    vessel.aisType,
    vessel.ais_type,
    vessel.vesselType,
    vessel.vessel_type,
    vessel.shipType,
    vessel.ShipType,
    vessel.type,
    vessel.vesselClass,
    vessel.vessel_class,
    metadata.ShipType,
    metadata.shipType,
    metadata.vesselType,
    metadata.vesselClass,
    staticData.Type,
    staticData.type,
    nestedVessel.aisType,
    nestedVessel.ais_type,
    nestedVessel.vesselType,
    nestedVessel.vessel_type,
    nestedVessel.shipType,
    nestedVessel.ShipType,
    nestedAis.aisType,
    nestedAis.ais_type,
    nestedAis.vesselType,
    nestedAis.vessel_type,
    nestedAis.shipType,
    nestedAis.ShipType,
    sourcePayload.aisType,
    sourcePayload.ais_type,
    sourcePayload.vesselType,
    sourcePayload.vessel_type,
    sourcePayload.shipType,
    sourcePayload.ShipType,
    sourceMetadata.ShipType,
    sourceMetadata.shipType,
  ].filter((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== "");
  const typeText = rawTypes.map((candidate) => String(candidate).trim()).join(" | ");
  const codeMatch = typeText.match(/(?:^|\D)(7\d)(?:\D|$)/);
  const exactNumMatch = rawTypes.map(r => Number(String(r).trim())).find(n => Number.isFinite(n) && n > 0);

  return {
    code: codeMatch ? Number(codeMatch[1]) : (exactNumMatch ?? null),
    text: typeText,
  };
}

export function isStrictDryCargoVessel(value: unknown) {
  const { code, text } = readAisType(value);
  if (STRICT_EXCLUDED_PATTERN.test(text)) {
    const isHardNoise = /\b(fishing|trawler|tug|tugboat|pleasure craft|sailing|yacht|dredger|manned vts|vts|port hand mark|starboard hand mark|special mark|sea farm|reference point|isolated danger|buoy|boya|baliza|military ops|search and rescue|sar|pilot|workboat|other|unknown)\b/i.test(text);
    if (isHardNoise) return false;
  }
  if (code !== null) {
    if ((code >= 20 && code < 70) || code === 0 || code >= 90) return false;
    if (code >= 70 && code <= 79) return true;
  }
  if (!text) return false;
  return STRICT_CARGO_PATTERN.test(text);
}

export function filterStrictDryCargoVessels<T>(values: T[]) {
  return values.filter(isStrictDryCargoVessel);
}
