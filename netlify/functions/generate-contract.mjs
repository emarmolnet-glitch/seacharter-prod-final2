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

  const payload = await req.json().catch(() => ({}))
  const cargo = payload?.carga?.tipo || 'cargo'

  return json({
    success: true,
    data: {
      armador_pro: {
        terms: 'FIOS, free in/out stowed and trimmed.',
        laytime: 'SHEX unless local port practice requires otherwise.',
        triggers: 'NOR tendered on arrival at customary waiting place.',
        payment: '100% freight prepaid before release of bills of lading.',
        rationale: `Protects owner cash flow and operational exposure for ${cargo}.`,
      },
      fletador_pro: {
        terms: 'FIOS with documented port exceptions.',
        laytime: 'SHEX with reversible laytime by mutual agreement.',
        triggers: 'NOR accepted when vessel is physically and legally ready.',
        payment: 'Freight payable against shipping documents.',
        rationale: 'Balances payment timing with evidence of cargo documentation.',
      },
      estrategia_justa: {
        recomendacion: 'Use a split freight mechanism and clear NOR readiness language.',
      },
      smart_autofill: {
        freight_terms: 'FIOS',
        laytime_term: 'SHEX',
        load_laytime_term: 'SHEX',
        discharge_laytime_term: 'SHEX',
        triggers_combined: 'NOR',
        ritmo_carga_final: 3000,
        ritmo_descarga_final: 2500,
        payment: '100% Freight Prepaid',
        payment_clause: 'Freight to be paid 100% pre-paid before release of Bills of Lading.',
        ia_rationale: 'Fallback contractual recommendation generated without external AI.',
      },
    },
  })
}
