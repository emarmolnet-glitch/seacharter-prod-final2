const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // <-- NUEVA IMPORTACIÓN DE IA

if (typeof Packer.toBase64 !== 'function') {
  Packer.toBase64 = async (doc) => {
    if (typeof Packer.toBase64String === 'function') {
      return await Packer.toBase64String(doc);
    }
    const buf = await Packer.toBuffer(doc);
    return buf.toString('base64');
  };
}

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
    pool = new Pool({
      connectionString: connStr || undefined,
      ssl: connStr && (connStr.includes('localhost') || connStr.includes('127.0.0.1'))
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

const handler = async (event, context) => {
  if (event && event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  let body = {};
  if (typeof Request !== 'undefined' && event instanceof Request) {
    try {
      body = await event.json();
    } catch (e) {
      body = {};
    }
  } else if (event && event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      body = {};
    }
  }

  const pol = body.pol || body.POL || 'Rotterdam';
  const pod = body.pod || body.POD || 'Houston';
  const mercancia = body.mercancia || body.Mercancía || body.commodity || 'Carga General';
  const tipo_loi = body.tipo_loi || 'Delivery without original B/L'; // <-- CAPTURAMOS EL DESPLEGABLE

  // 1. Extraemos la base legal de Neon
  let texto_clausula = '';
  try {
    const dbPool = getPool();
    const result = await dbPool.query(
      "SELECT texto_clausula FROM conocimiento_legal_vectores WHERE tipo_documento ILIKE '%LOI%' LIMIT 1;"
    );
    if (result.rows && result.rows.length > 0) {
      texto_clausula = result.rows[0].texto_clausula;
    }
  } catch (dbErr) {
    console.error('Error consultando conocimiento_legal_vectores en Neon:', dbErr);
  }

  if (!texto_clausula) {
    texto_clausula = 'Letter of Indemnity for discharge of bulk cargo without production of original Bills of Lading at port of destination, holding Owners harmless from any claims or maritime liens.';
  }

  // 2. Cerebro.ia redacta el documento legal (NUEVO BLOQUE)
  let textoRedactadoPorIA = '';
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API KEY de Gemini no configurada");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
    
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
    textoRedactadoPorIA = aiResult.response.text();
    
    // Limpiamos posible markdown residual
    textoRedactadoPorIA = textoRedactadoPorIA.replace(/\*\*/g, '').replace(/```/g, '').trim();

  } catch (aiErr) {
    console.error('Error generando redacción con IA:', aiErr);
    textoRedactadoPorIA = `[ERROR DE IA - MOSTRANDO TEXTO CRUDO]\n\nPOL: ${pol}\nPOD: ${pod}\nMERCANCÍA: ${mercancia}\n\nCLÁUSULA: ${texto_clausula}`;
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
            alignment: "center",
          }),
          new Paragraph({ text: '' }), // Espaciador
          
          // Mapeamos cada línea devuelta por la IA como un párrafo justificado en el Word
          ...textoRedactadoPorIA.split('\n').map(line => {
            return new Paragraph({
              text: line.trim(),
              alignment: "both", // Justificado
              spacing: { after: 120 } // Espaciado entre párrafos
            });
          })
        ],
      },
    ],
  });

  const b64 = await Packer.toBase64(doc);

  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="LOI_${pol.replace(/[^a-zA-Z0-9]/g, '')}_${pod.replace(/[^a-zA-Z0-9]/g, '')}.docx"`
    },
    body: b64
  };
};

exports.handler = handler;
module.exports = { handler, default: handler };
