function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders(),
  })
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type,accept',
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() })
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  return json({
    success: true,
    data: {
      formulario: {
        pumping_guarantee: 'Max 24.0 hrs unloading / Min 100 PSI',
        laytime: '72.0',
        freight_type: 'Worldscale',
        payment: '100% Freight Prepaid',
        terms_nor: 'NOR tendered when vessel is ready in all respects.',
      },
      armador_pro: {
        pumping_guarantee: 'Max 24.0 hrs unloading / Min 100 PSI',
        laytime: '72.0',
        cleaning_heating: 'Charterers to warrant cargo compatibility and heating instructions.',
        payment: '100% Freight Prepaid',
        rationale: 'Preserves pumping performance certainty and demurrage protection.',
      },
      fletador_pro: {
        pumping_guarantee: 'Max 36.0 hrs unloading subject to terminal capability.',
        laytime: '96.0',
        cleaning_heating: 'Owners remain responsible for tank cleanliness on arrival.',
        payment: 'Freight payable against cargo documents.',
        rationale: 'Links terminal delays and tank condition to operational evidence.',
      },
      estrategia_justa: {
        recomendacion: 'Adopt a measurable pumping warranty with terminal-delay carveouts.',
      },
      auditoria: {
        riesgo_armador: 'Clarify pumping warranty, pressure threshold, and terminal exceptions.',
        riesgo_fletador: 'Require evidence of readiness and cargo compatibility before NOR.',
        posicion_riesgo: 'Riesgo medio controlable',
      },
      comparativa: {
        clausula: 'Pumping / NOR / Freight',
        armador: 'Firm prepaid freight and measurable pumping standard.',
        fletador: 'Documented readiness and terminal-delay exceptions.',
      },
      diccionario: [
        { termino: 'NOR', definicion: 'Notice of Readiness.' },
        { termino: 'Demurrage', definicion: 'Compensation for time beyond allowed laytime.' },
      ],
    },
  })
}
