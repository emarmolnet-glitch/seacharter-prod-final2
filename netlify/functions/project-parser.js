// Polyfill indispensable para entornos Node.js (Netlify Functions)
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
  };
}

import { parsePackingList } from '../../packing-list-parsers.js';
import Busboy from 'busboy';

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    // Parsear multipart/form-data para extraer el archivo adjunto real
    const fileData = await new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: event.headers });
      let fileBuffer = [];
      let fileName = 'documento.pdf';
      let fileMime = 'application/pdf';

      busboy.on('file', (fieldname, file, info) => {
        fileName = info.filename || fileName;
        fileMime = info.mimeType || fileMime;
        file.on('data', (data) => fileBuffer.push(data));
        file.on('end', () => {});
      });

      busboy.on('finish', () => {
        const buffer = Buffer.concat(fileBuffer);
        resolve({
          name: fileName,
          type: fileMime,
          arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        });
      });

      busboy.on('error', (err) => reject(err));
      
      const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
      busboy.end(bodyBuffer);
    });

    const result = await parsePackingList(fileData);
    const items = result?.items || result || [];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        items: Array.isArray(items) ? items : [items]
      })
    };

  } catch (error) {
    console.error('Error en project-parser:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
