import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import pg from 'pg';
const { Pool } = pg;
import { GoogleGenerativeAI } from '@google/generative-ai';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getConnectionString() {
  const envKeys = [
    'DATABASE_URL',
    'NETLIFY_DATABASE_URL',
    'NETLIFY_DB_URL',
    'NEON_DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
  ];
  for (const key of envKeys) {
    const val = process.env[key];
    if (val && typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
}

let pool = null;
function getPool() {
  if (!pool) {
    const connStr = getConnectionString();
    if (!connStr) return null;
    pool = new Pool({
      connectionString: connStr,
      ssl: connStr.includes('localhost') || connStr.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function handler(req, context) {
  const method = req?.method || req?.httpMethod || '';

  if (method === 'OPTIONS') {
    if (typeof Response !== 'undefined' && (req instanceof Response || typeof req?.json === 'function' || req?.url)) {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (method !== 'POST' && method !== '') {
    if (typeof Response !== 'undefined' && (req instanceof Response || typeof req?.json === 'function' || req?.url)) {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }
    return {
      statusCode: 405,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let body = {};
  if (typeof req?.json === 'function') {
    try {
      body = await req.json();
    } catch (_) {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch (_) {
        body = {};
      }
    }
  } else if (req?.body) {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (_) {
      body = {};
    }
  }

  const pol = body.pol || body.POL || 'Rotterdam';
  const pod = body.pod || body.POD || 'Houston';
  const mercancia = body.mercancia || body.Mercancía || body.commodity || 'Carga General';
  const tipo_loi = body.tipo_loi || 'Delivery without original B/L';

  // 1. Extraemos la base legal de Neon (si está disponible)
  let texto_clausula = '';
  try {
    const dbPool = getPool();
    if (dbPool) {
      const result = await dbPool.query(
        "SELECT texto_clausula FROM conocimiento_legal_vectores WHERE tipo_documento ILIKE '%LOI%' LIMIT 1;"
      );
      if (result.rows && result.rows.length > 0) {
        texto_clausula = result.rows[0].texto_clausula;
      }
    }
  } catch (dbErr) {
    console.error('Error consultando conocimiento_legal_vectores en Neon:', dbErr);
  }

  if (!texto_clausula) {
    texto_clausula = 'Letter of Indemnity for discharge of bulk cargo without production of original Bills of Lading at port of destination, holding Owners harmless from any claims or maritime liens.';
  }

  // 2. Cerebro.ia redacta el documento legal con Gemini
  let textoRedactadoPorIA = '';
  try {
    const apiKey = process.env.GEMINI_API_KEY
      || (typeof Netlify !== 'undefined' && Netlify.env?.get?.('GEMINI_API_KEY'))
      || process.env.NETLIFY_AI_GATEWAY_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Actúa como un abogado marítimo experto en P&I Clubs. 
Redacta el texto completo y formal de una Letter of Indemnity (LOI) para el caso específico: "${tipo_loi}". 
Utiliza como base legal este fragmento de nuestra base de datos: "${texto_clausula}". 
Datos operativos del viaje: 
- Puerto de Carga (POL): ${pol}
- Puerto de Descarga (POD): ${pod}
- Mercancía: ${mercancia}

Instrucciones de formato: 
- Genera el documento con la estructura clásica y formal de los P&I Clubs (To: The Owners / Date / Dear Sirs / In consideration of... etc.).
- Incluye espacios en blanco tipo [INSERTAR DATOS] si falta información clave (como el nombre del armador o fecha exacta del BL).
- Devuelve SOLO el texto del documento, sin markdown (sin asteriscos ni comillas de bloque), listo para imprimir como párrafos en Word.`;

      const aiResult = await model.generateContent(prompt);
      textoRedactadoPorIA = aiResult?.response?.text?.() || '';

      // Limpiamos posible markdown residual
      textoRedactadoPorIA = textoRedactadoPorIA.replace(/\*\*/g, '').replace(/```/g, '').trim();
    }
  } catch (aiErr) {
    console.error('Error generando redacción con IA:', aiErr);
  }

  if (!textoRedactadoPorIA) {
    textoRedactadoPorIA = `LETTER OF INDEMNITY\n\nTo: The Owners of the Vessel\nDate: [INSERT DATE]\n\nDear Sirs,\n\nRe: ${tipo_loi}\n\nVessel: [INSERT VESSEL NAME]\nVoyage: From ${pol} to ${pod}\nCargo: ${mercancia}\n\nIn consideration of your agreeing at our request to deliver the above cargo without production of the original Bills of Lading, we hereby agree and undertake as follows:\n\n1. ${texto_clausula}\n\n2. To indemnify you, your servants and agents and to hold all of you harmless in respect of any liability, loss, damage or expense of whatsoever nature which you may sustain by reason of delivering the cargo in accordance with our request.\n\n3. In the event of any proceedings being commenced against you or any of your servants or agents in connection with the delivery of the cargo as aforesaid, to provide you or them on demand with sufficient funds to defend the same.\n\n4. If, in connection with the delivery of the cargo as aforesaid, the ship, or any other ship or property in the same or associated ownership, management or control, should be arrested or detained, to provide such bail or other security as may be required to prevent such arrest or detention or to secure the release of such ship or property.\n\n5. This indemnity shall be governed by and construed in accordance with English law and each and any person liable under this indemnity shall submit to the jurisdiction of the High Court of Justice of England.\n\nYours faithfully,\n\nFor and on behalf of\n[INSERT COMPANY NAME]\n\n__________________________\nAuthorized Signatory`;
  }

  // 3. Empaquetado del documento Word
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'LETTER OF INDEMNITY (LOI)',
            heading: HeadingLevel.TITLE,
            alignment: 'center',
          }),
          new Paragraph({ text: '' }),
          ...textoRedactadoPorIA.split('\n').map(line => {
            return new Paragraph({
              text: line.trim(),
              alignment: 'both',
              spacing: { after: 120 },
            });
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const isWebStandard = typeof Request !== 'undefined' && req instanceof Request;

  if (isWebStandard || (!req?.httpMethod && req?.url)) {
    return new Response(buffer, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="LOI.docx"',
      },
    });
  }

  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="LOI.docx"',
    },
    body: buffer.toString('base64'),
  };
}

export default handler;
