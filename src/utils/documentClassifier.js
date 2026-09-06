// utils/documentClassifier.js

export function classifyDocument(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { type: 'PACKING_LIST', confidence: 0 };
  }

  const text = rawText.toLowerCase();

  const keywords = {
    COMMERCIAL_INVOICE: ['invoice', 'commercial invoice', 'factura', 'factura comercial', 'unit price', 'total amount', 'incoterms', 'fob', 'cif', 'exw'],
    CARGO_MANIFEST: ['manifest', 'bill of lading', 'b/l', 'manifiesto', 'port of loading', 'port of discharge', 'container no', 'seal no', 'vessel name'],
    TECHNICAL_DATASHEET: ['datasheet', 'ficha técnica', 'drawing', 'plano', 'center of gravity', 'cog', 'lifting lugs', 'eslingado', 'especificaciones técnicas'],
    CUSTOMS: ['certificado de origen', 'eur.1', 'cbam', 'aduana', 'customs declaration', 'arancel', 'hs code declaration', 'emissions intensity'],
    PACKING_LIST: ['packing list', 'lista de empaque', 'lista de embarque', 'cubicaje', 'dimensions', 'peso bruto', 'peso u.', 'modo envío', 'skid', 'bultos']
  };

  const scores = {};
  let maxScore = 0;
  let bestMatch = 'PACKING_LIST';

  for (const [docType, list] of Object.entries(keywords)) {
    let score = 0;
    for (const kw of list) {
      if (text.includes(kw)) {
        score++;
      }
    }
    scores[docType] = score;
    if (score > maxScore) {
      maxScore = score;
      bestMatch = docType;
    }
  }

  return {
    type: maxScore > 0 ? bestMatch : 'PACKING_LIST',
    confidence: maxScore,
    scores
  };
}
