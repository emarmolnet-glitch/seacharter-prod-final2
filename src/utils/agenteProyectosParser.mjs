// src/utils/agenteProyectosParser.mjs

/**
 * Analizador de lenguaje natural para órdenes del Agente de Proyectos.
 * Extrae números e intenciones clave (almacenaje, surveyor, piezas, etc.)
 * evitando el comportamiento de "loro" y devolviendo un payload estructurado.
 */
export function parseProjectInstruction(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      payload: {},
      detectedActions: [],
      agentResponse: 'Por favor, introduce una orden o parámetro para el proyecto.'
    };
  }

  const text = rawText.trim();
  const lower = text.toLowerCase();
  const payload = {
    instruction: text
  };
  const detectedActions = [];

  // 1. Días de almacenaje: "almacenaje 5 días", "5 días de almacenaje", "almacenaje 10", "almacén 3 días"
  const storageRegex1 = /(?:almacenaje|almac[eé]n|estancia)\s*(?:de|:)?\s*(\d+)\s*(?:d[ií]as)?/i;
  const storageRegex2 = /(\d+)\s*(?:d[ií]as)\s*(?:de)?\s*(?:almacenaje|almac[eé]n|estancia)/i;
  const storageRegex3 = /(?:d[ií]as)\s*(?:de)?\s*almacenaje\s*[:=]?\s*(\d+)/i;

  let storageVal = null;
  const mS1 = lower.match(storageRegex1);
  const mS2 = lower.match(storageRegex2);
  const mS3 = lower.match(storageRegex3);

  if (mS1 && mS1[1]) {
    storageVal = parseInt(mS1[1], 10);
  } else if (mS2 && mS2[1]) {
    storageVal = parseInt(mS2[1], 10);
  } else if (mS3 && mS3[1]) {
    storageVal = parseInt(mS3[1], 10);
  } else if ((lower.includes('almacenaje') || lower.includes('almacen')) && !lower.includes('pieza')) {
    const num = lower.match(/\d+/);
    if (num) storageVal = parseInt(num[0], 10);
  }

  if (storageVal !== null && !isNaN(storageVal)) {
    payload.storageDays = storageVal;
    detectedActions.push(`Almacenaje configurado a ${storageVal} día${storageVal === 1 ? '' : 's'}`);
  }

  // 2. Coste de Surveyor: "surveyor 1500", "perito 1500", "surveyor 1.500 €", "1500 de surveyor"
  const surveyorRegex1 = /(?:surveyor|perito|peritaje|inspecci[oó]n)\s*(?:de|coste|tarifa|:)?\s*(\d+[\d.,]*)/i;
  const surveyorRegex2 = /(\d+[\d.,]*)\s*(?:€|eur|euros)?\s*(?:de|para|en)?\s*(?:surveyor|perito|peritaje|inspecci[oó]n)/i;

  let surveyorVal = null;
  const mSurv1 = lower.match(surveyorRegex1);
  const mSurv2 = lower.match(surveyorRegex2);

  if (mSurv1 && mSurv1[1]) {
    surveyorVal = parseFloat(mSurv1[1].replace(/\./g, '').replace(',', '.'));
  } else if (mSurv2 && mSurv2[1]) {
    surveyorVal = parseFloat(mSurv2[1].replace(/\./g, '').replace(',', '.'));
  } else if ((lower.includes('surveyor') || lower.includes('perito')) && !lower.includes('pieza')) {
    const num = lower.match(/\d+/);
    if (num) surveyorVal = parseFloat(num[0]);
  }

  if (surveyorVal !== null && !isNaN(surveyorVal)) {
    payload.surveyorCost = surveyorVal;
    detectedActions.push(`Coste de surveyor ajustado a ${surveyorVal.toLocaleString('es-ES')} €`);
  }

  // 3. Transporte Inland: "inland 800", "transporte 1200", "camion 650"
  const inlandRegex1 = /(?:inland|transporte|cami[oó]n|flete\s*terrestre)\s*(?:de|coste|:)?\s*(\d+[\d.,]*)/i;
  const inlandRegex2 = /(\d+[\d.,]*)\s*(?:€|eur|euros)?\s*(?:de|para|en)?\s*(?:inland|transporte|cami[oó]n)/i;

  let inlandVal = null;
  const mInland1 = lower.match(inlandRegex1);
  const mInland2 = lower.match(inlandRegex2);

  if (mInland1 && mInland1[1]) {
    inlandVal = parseFloat(mInland1[1].replace(/\./g, '').replace(',', '.'));
  } else if (mInland2 && mInland2[1]) {
    inlandVal = parseFloat(mInland2[1].replace(/\./g, '').replace(',', '.'));
  }

  if (inlandVal !== null && !isNaN(inlandVal)) {
    payload.inlandCost = inlandVal;
    detectedActions.push(`Coste de transporte inland ajustado a ${inlandVal.toLocaleString('es-ES')} €`);
  }

  // 4. Aduanas: "aduanas 450", "despacho 300"
  const customsRegex1 = /(?:aduanas?|despacho|arancel(?:es)?)\s*(?:de|coste|:)?\s*(\d+[\d.,]*)/i;
  const customsRegex2 = /(\d+[\d.,]*)\s*(?:€|eur|euros)?\s*(?:de|para|en)?\s*(?:aduanas?|despacho)/i;

  let customsVal = null;
  const mCustoms1 = lower.match(customsRegex1);
  const mCustoms2 = lower.match(customsRegex2);

  if (mCustoms1 && mCustoms1[1]) {
    customsVal = parseFloat(mCustoms1[1].replace(/\./g, '').replace(',', '.'));
  } else if (mCustoms2 && mCustoms2[1]) {
    customsVal = parseFloat(mCustoms2[1].replace(/\./g, '').replace(',', '.'));
  }

  if (customsVal !== null && !isNaN(customsVal)) {
    payload.customsCost = customsVal;
    detectedActions.push(`Coste de aduanas ajustado a ${customsVal.toLocaleString('es-ES')} €`);
  }

  // 5. Materiales de estiba y trincaje estructural
  const dunnageMatch = lower.match(/(?:maderas?|dunnage)\s*[:=]?\s*(\d+)/i);
  if (dunnageMatch) {
    const val = parseInt(dunnageMatch[1], 10);
    payload.dunnageWood = val;
    detectedActions.push(`${val} unidades de madera de estiba (dunnage)`);
  }

  const slingsMatch = lower.match(/(?:eslingas?|slings?)\s*[:=]?\s*(\d+)/i);
  if (slingsMatch) {
    const val = parseInt(slingsMatch[1], 10);
    payload.highCapacitySlings = val;
    detectedActions.push(`${val} eslingas de alta capacidad`);
  }

  const chainsMatch = lower.match(/(?:cadenas?|chains?)\s*[:=]?\s*(\d+)/i);
  if (chainsMatch) {
    const val = parseInt(chainsMatch[1], 10);
    payload.chainsBinders = val;
    detectedActions.push(`${val} cadenas y tensores pesados`);
  }

  const craneMatch = lower.match(/(?:gr[uú]as?|heavy\s*lift)\s*[:=]?\s*(\d+)/i);
  if (craneMatch) {
    const val = parseInt(craneMatch[1], 10);
    payload.heavyLiftCrane = val;
    detectedActions.push(`${val} grúa(s) Heavy Lift portuaria`);
  }

  const mafiMatch = lower.match(/(?:mafi|plataformas?)\s*[:=]?\s*(\d+)/i);
  if (mafiMatch) {
    const val = parseInt(mafiMatch[1], 10);
    payload.mafiPlatforms = val;
    detectedActions.push(`${val} plataforma(s) MAFI`);
  }

  const gangMatch = lower.match(/(?:turnos?|cuadrillas?|estibadores?)\s*(?:de\s*estiba)?\s*[:=]?\s*(\d+)/i);
  if (gangMatch) {
    const val = parseInt(gangMatch[1], 10);
    payload.stevedoreGangs = val;
    detectedActions.push(`${val} turno(s) / cuadrilla(s) de estiba`);
  }

  // 6. Añadir pieza / carga de proyecto
  const isAddPiece = /(?:a[ñn]adir|agregar|nueva|meter|sumar|incluir|insertar|crear)\s*(?:una\s*)?(?:pieza|carga|bulto|equipo|transformador|skid|generador|maquinaria|item)/i.test(lower)
    || (lower.includes('pieza') && (lower.includes('añad') || lower.includes('agreg') || lower.includes('nueva') || lower.includes('meter') || lower.includes('crear')));

  if (isAddPiece) {
    payload.addPiece = true;
    payload.forceOpenModal = true;

    // Detectar peso si fue especificado (ej: 35000 kg o 35 tn)
    let pieceWeight = '34000';
    const tonsMatch = lower.match(/(\d+[\d.,]*)\s*(?:t\b|tn\b|toneladas)/i);
    const kgMatch = lower.match(/(\d+[\d.,]*)\s*(?:kg|kilos)/i);
    if (kgMatch) {
      pieceWeight = kgMatch[1].replace(/\./g, '').replace(',', '.');
    } else if (tonsMatch) {
      const tons = parseFloat(tonsMatch[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(tons)) pieceWeight = String(tons * 1000);
    }

    // Detectar dimensiones si fueron especificadas (ej: 6.2x2.8x3.4)
    const dimMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:x|\*)\s*(\d+(?:[.,]\d+)?)\s*(?:x|\*)\s*(\d+(?:[.,]\d+)?)/i);
    let l = '6.2', w = '2.8', h = '3.4';
    if (dimMatch) {
      l = dimMatch[1].replace(',', '.');
      w = dimMatch[2].replace(',', '.');
      h = dimMatch[3].replace(',', '.');
    }

    // Tipo de pieza según intención
    let pieceType = 'Transformador / Skid Industrial (IA)';
    if (lower.includes('transformador')) pieceType = 'Transformador Eléctrico Principal';
    else if (lower.includes('generador')) pieceType = 'Generador Diésel / Turbina Industrial';
    else if (lower.includes('skid')) pieceType = 'Skid de Filtrado / Bombeo';
    else if (lower.includes('caldera')) pieceType = 'Caldera Industrial';
    else if (lower.includes('maquinaria')) pieceType = 'Módulo de Maquinaria Pesada';
    else if (lower.includes('vehiculo') || lower.includes('camion')) pieceType = 'Vehículo Industrial Autopropulsado';

    const numWeight = parseFloat(pieceWeight) || 34000;
    const shippingModeSupported = numWeight > 30000 ? "40' Flat Rack" : "40' HC Contenedor";

    payload.newPiece = {
      id: `item-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      category: 'Equipos de Proceso',
      quantity: 1,
      type: pieceType,
      length: l,
      width: w,
      height: h,
      weight: pieceWeight,
      shipping_mode_supported: shippingModeSupported
    };

    detectedActions.push(`Nueva pieza añadida: "${pieceType}" (${l}x${w}x${h} m, ${Number(pieceWeight).toLocaleString('es-ES')} kg)`);
  }

  // 7. Solicitud de desglose financiero separado (Flete vs. FOB / Operativa Portuaria)
  const isBreakdown = /(?:desglose|desglos|separar|separa|subtotales?|flete\s*vs|flete\s*y\s*fob|fob\s*y\s*flete|all-in|costes?\s*separados?|desglose\s*financiero)/i.test(lower);
  if (isBreakdown) {
    payload.requestFinancialBreakdown = true;
    payload.showFinancialBreakdown = true;
    payload.forceOpenModal = true;
    detectedActions.push('Desglose financiero activado: separación rigurosa de Flete Marítimo (Ocean Freight / TCE) y Costes FOB / Operativa Portuaria');
  }

  // Generación de respuesta explicativa sin comportamiento de "loro"
  let agentResponse = '';
  if (detectedActions.length > 0) {
    agentResponse = `✅ Entendido. He procesado tu solicitud y aplicado los siguientes cambios:\n• ` + detectedActions.join('\n• ');
    if (payload.requestFinancialBreakdown) {
      agentResponse += '\n\n📊 Estructura financiera desglosada y sincronizada en el workspace:\n' +
        '• Subtotal Flete Marítimo / TCE del buque.\n' +
        '• Subtotal Costes FOB y Operativa Portuaria (muelle, trincaje, tasas y servicios asociados).\n' +
        '• Importe Total de Cotización / Venta (All-In).\n' +
        'Los subtotales ya son visibles de forma transparente en el Project Cargo Builder.';
    } else if (payload.addPiece || payload.forceOpenModal) {
      agentResponse += '\n\n📂 He forzado la apertura del Project Cargo Builder para que puedas verificar la estiba y los costes asociados.';
    }
  } else {
    agentResponse = `He analizado tu mensaje: "${text}". Puedes pedirme órdenes concretas como "almacenaje 5 días", "surveyor 1500", "transporte 800", "aduanas 450", "desglose financiero" o "añadir pieza" para sincronizar automáticamente el workspace del proyecto.`;
  }

  return {
    payload,
    detectedActions,
    agentResponse
  };
}
