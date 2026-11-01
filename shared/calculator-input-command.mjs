// Only explicit assignments to known calculator inputs bypass the AI services.
const FIELDS = Object.freeze({
  'ritmo de carga': 'rate-load', 'ritmo carga': 'rate-load',
  'ritmo de descarga': 'rate-disch', 'ritmo descarga': 'rate-disch',
  'flete de venta': 'freight-sell', 'flete venta': 'freight-sell',
  'flete de compra': 'freight-rate', 'flete compra': 'freight-rate',
  'demora': 'demurrage-rate', 'demoras': 'demurrage-rate',
  'demurrage': 'demurrage-rate', 'tarifa de demora': 'demurrage-rate',
  'tarifa de demoras': 'demurrage-rate', 'horas de demora': 'asb-delay-hours-main',
});

function parseNumber(raw) {
  // A single three-digit suffix is a thousands group; decimal freight prices
  // use one or two digits. Mixed separators use the last as the decimal mark.
  const separators = raw.match(/[.,]/g) || [];
  if (!separators.length) return Number(raw);
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
  const last = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  return Number(raw.slice(0, last).replace(/[.,]/g, '') + '.' + raw.slice(last + 1));
}

export function parseCalculatorInputCommand(message) {
  const text = String(message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^por favor[, ]+/, '').replace(/[, ]+por favor[.!]?$/, '').replace(/[.!]$/, '');
  const parts = text.split(/\s+y\s+|\s*;\s*/);
  const updates = [];
  for (const part of parts) {
    const match = part.match(/^(?:(?:quiero|necesito)\s+)?(?:cambia(?:r)?|modifica(?:r)?|ajusta(?:r)?|actualiza(?:r)?|establece(?:r)?|fija(?:r)?|pon(?:er)?|sube|baja)\s+(?:(?:el|la|los|las)\s+)?(.+?)\s+(?:a|en|=)\s*\$?\s*(\d[\d.,]*)(?:\s*(?:usd|eur|\$|mt\/dia|tm\/dia|t\/dia|usd\/dia|usd\/t|horas))?$/);
    if (!match || !FIELDS[match[1]]) return null;
    const value = parseNumber(match[2]);
    if (!Number.isFinite(value) || value < 0) return null;
    if (FIELDS[match[1]].startsWith('rate-') && value === 0) return null;
    updates.push({ action: 'update_field', field: FIELDS[match[1]], value });
  }
  return updates.length ? updates : null;
}
