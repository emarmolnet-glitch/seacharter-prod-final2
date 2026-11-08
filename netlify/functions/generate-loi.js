const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { Pool } = require('pg');

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

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'LETTER OF INDEMNITY (LOI)',
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Puerto de Carga (POL): ', bold: true }),
              new TextRun(String(pol)),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Puerto de Descarga (POD): ', bold: true }),
              new TextRun(String(pod)),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Mercancía: ', bold: true }),
              new TextRun(String(mercancia)),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'CLÁUSULA LEGAL (LOI)',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(String(texto_clausula)),
            ],
          }),
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
      'Content-Disposition': 'attachment; filename="LOI.docx"'
    },
    body: b64
  };
};

exports.handler = handler;
module.exports = { handler, default: handler };
