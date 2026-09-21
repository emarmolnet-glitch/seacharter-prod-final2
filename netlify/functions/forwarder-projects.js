const { Pool } = require('pg');

function getDatabaseConnectionString() {
  const envKeys = [
    'DATABASE_URL',
    'NETLIFY_DATABASE_URL',
    'NETLIFY_DB_URL',
    'NEON_DATABASE_URL',
    'POSTGRES_URL',
    'PGDATABASE_URL',
  ];

  for (const key of envKeys) {
    const val = process.env[key];
    if (val && typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
}

const connectionString = getDatabaseConnectionString();

const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: connectionString ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on('error', (err) => {
  console.error('⚠️ [forwarder-projects] Error imprevisto en cliente de pool de base de datos:', err);
});

// Cabeceras CORS obligatorias para evitar bloqueos del navegador
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

let schemaEnsured = false;
async function ensureForwarderSchema() {
  if (schemaEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS forwarder_projects (
        id SERIAL PRIMARY KEY,
        project_ref VARCHAR(255) UNIQUE,
        client_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Borrador',
        global_margin_percentage NUMERIC DEFAULT 15,
        documents JSONB DEFAULT '[]'::jsonb,
        items JSONB DEFAULT '[]'::jsonb,
        land_origin VARCHAR(255),
        land_destination VARCHAR(255),
        land_distance NUMERIC,
        land_freight_cost NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS land_origin VARCHAR(255);
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS land_destination VARCHAR(255);
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS land_distance NUMERIC;
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS land_freight_cost NUMERIC;
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS route_and_chartering JSONB;
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS valor_total_mercancia_usd NUMERIC;
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS land_freight_sale NUMERIC;
    `);
    schemaEnsured = true;
  } catch (_err) {
    // Ignore in offline or mock test environments
  }
}

/**
 * Filtro y sanitización estricta de documentos:
 * NUNCA persistir archivos binarios, buffers, o cadenas Base64 en base de datos.
 * Preservar exclusivamente los metadatos esenciales requeridos por la interfaz.
 */
function sanitizeDocuments(rawDocs) {
  if (!rawDocs) return [];
  const docsList = Array.isArray(rawDocs) ? rawDocs : [rawDocs];
  return docsList.map((doc, idx) => {
    if (!doc || typeof doc !== 'object') return null;
    const cleanPayload = doc.payload && typeof doc.payload === 'object'
      ? {
          name: doc.payload.name || doc.name,
          size: doc.payload.size ? (typeof doc.payload.size === 'string' ? doc.payload.size : `${Math.round(doc.payload.size / 1024)} KB`) : (doc.size || '120 KB'),
          itemsCount: Number(doc.payload.itemsCount || doc.itemsCount || 1),
          uploadedAt: doc.payload.uploadedAt || doc.date || new Date().toISOString()
        }
      : undefined;

    return {
      id: doc.id || `doc-${Date.now()}-${idx}`,
      name: String(doc.name || 'Documento_Proyecto.pdf').slice(0, 255),
      size: doc.size ? (typeof doc.size === 'string' ? doc.size : `${Math.round(doc.size / 1024)} KB`) : '120 KB',
      date: String(doc.date || new Date().toLocaleDateString('es-ES')),
      itemsCount: Number(doc.itemsCount || 1),
      ...(cleanPayload ? { payload: cleanPayload } : {})
    };
  }).filter(Boolean);
}

/**
 * Sanitización de ítems/servicios de proyecto:
 * Descarta cadenas base64, buffers o blobs pesados que pudieran incrustarse en payload_data o campos anidados.
 */
function sanitizeProjectItems(rawItems) {
  if (!rawItems) return [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];
  return list.map((item, idx) => {
    if (!item || typeof item !== 'object') return null;
    const cleanItem = { ...item };

    // Eliminar cualquier campo directo con base64 o archivo masivo
    delete cleanItem.fileBase64;
    delete cleanItem.dataBase64;
    delete cleanItem.fileBuffer;
    delete cleanItem.rawContent;

    // Si tiene payload_data anidado, sanitizarlo recursivamente
    if (cleanItem.payload_data && typeof cleanItem.payload_data === 'object') {
      const pd = { ...cleanItem.payload_data };
      delete pd.fileBase64;
      delete pd.dataBase64;
      delete pd.fileBuffer;
      delete pd.rawContent;
      if (pd.documentMeta && typeof pd.documentMeta === 'object') {
        const dm = { ...pd.documentMeta };
        delete dm.dataBase64;
        delete dm.fileBuffer;
        pd.documentMeta = dm;
      }
      cleanItem.payload_data = pd;
    }

    return cleanItem;
  }).filter(Boolean);
}

/**
 * Sanitiza una fila de proyecto antes de devolverla en GET
 * para garantizar respuestas ligeras (< 50KB en lugar de > 6MB).
 */
function sanitizeProjectResponseRow(row) {
  if (!row) return row;
  return {
    ...row,
    documents: sanitizeDocuments(row.documents),
    items: sanitizeProjectItems(row.items)
  };
}

exports.handler = async (event) => {
  const { httpMethod, body } = event;

  // 0. Interceptar peticiones OPTIONS (CORS preflight)
  if (httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    await ensureForwarderSchema();

    // 1. CREAR O ACTUALIZAR UN EXPEDIENTE (POST)
    if (httpMethod === 'POST') {
      const data = JSON.parse(body || '{}');
      const valorTotalMercanciaUsd = (data.valor_total_mercancia_usd !== undefined && data.valor_total_mercancia_usd !== null)
        ? Number(data.valor_total_mercancia_usd)
        : ((data.valorTotalMercanciaUsd !== undefined && data.valorTotalMercanciaUsd !== null) ? Number(data.valorTotalMercanciaUsd) : null);
      const landFreightSale = (data.land_freight_sale !== undefined && data.land_freight_sale !== null)
        ? Number(data.land_freight_sale)
        : ((data.landFreightSale !== undefined && data.landFreightSale !== null) ? Number(data.landFreightSale) : null);
      
      // MODO ACTUALIZACIÓN (Si ya existe ID o REF)
      if (data.id || data.project_ref) {
        const statusValue = (data.status !== undefined && data.status !== null && String(data.status).trim())
          ? String(data.status).trim()
          : null;
        const marginValue = (data.global_margin_percentage !== undefined && data.global_margin_percentage !== null)
          ? String(data.global_margin_percentage)
          : null;
        const landOrigin = data.land_origin !== undefined ? data.land_origin : null;
        const landDestination = data.land_destination !== undefined ? data.land_destination : null;
        const landDistance = data.land_distance !== undefined && data.land_distance !== null ? Number(data.land_distance) : null;
        const landFreightCost = data.land_freight_cost !== undefined && data.land_freight_cost !== null ? Number(data.land_freight_cost) : null;
        const routeAndChartering = (data.route_and_chartering !== undefined && data.route_and_chartering !== null)
          ? JSON.stringify(data.route_and_chartering)
          : ((data.routeAndChartering !== undefined && data.routeAndChartering !== null) ? JSON.stringify(data.routeAndChartering) : null);

        const updateQuery = `
          UPDATE forwarder_projects 
          SET documents = COALESCE($1::jsonb, documents),
              items = COALESCE($2::jsonb, items),
              client_name = COALESCE($3, client_name),
              status = COALESCE($6, status),
              global_margin_percentage = COALESCE($7, global_margin_percentage),
              land_origin = COALESCE($8, land_origin),
              land_destination = COALESCE($9, land_destination),
              land_distance = COALESCE($10, land_distance),
              land_freight_cost = COALESCE($11, land_freight_cost),
              route_and_chartering = COALESCE($12::jsonb, route_and_chartering),
              valor_total_mercancia_usd = COALESCE($13, valor_total_mercancia_usd),
              land_freight_sale = COALESCE($14, land_freight_sale)
          WHERE id = $4 OR project_ref = $5
          RETURNING *;
        `;
        const sanitizedDocs = data.documents !== undefined ? sanitizeDocuments(data.documents) : null;
        const rawItemsList = data.items || data.line_items || data.services;
        const sanitizedItems = rawItemsList !== undefined ? sanitizeProjectItems(rawItemsList) : null;

        const updateValues = [
          sanitizedDocs !== null ? JSON.stringify(sanitizedDocs) : null,
          sanitizedItems !== null ? JSON.stringify(sanitizedItems) : null,
          data.client_name || null,
          data.id ? parseInt(data.id, 10) : null,
          data.project_ref || null,
          statusValue,
          marginValue,
          landOrigin,
          landDestination,
          landDistance,
          landFreightCost,
          routeAndChartering,
          valorTotalMercanciaUsd,
          landFreightSale
        ];
        const updateResult = await pool.query(updateQuery, updateValues);
        if (updateResult.rows.length > 0) {
          return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Expediente actualizado con éxito', project: sanitizeProjectResponseRow(updateResult.rows[0]) })
          };
        }

        // UPSERT: Si no existía fila previa con ese project_ref (ej. RDM), crearla preservando la referencia
        const upsertRef = data.project_ref || `EXP-${Date.now().toString().slice(-6)}`;
        const upsertStatus = statusValue || 'BORRADOR';
        const upsertMargin = marginValue || '0';

        const upsertInsertQuery = `
          INSERT INTO forwarder_projects (project_ref, client_name, status, global_margin_percentage, documents, items, valor_total_mercancia_usd, land_freight_sale)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
          RETURNING *;
        `;
        const upsertInsertValues = [
          upsertRef, 
          data.client_name || 'Nuevo Cliente', 
          upsertStatus,
          upsertMargin,
          JSON.stringify(sanitizeDocuments(data.documents || [])),
          JSON.stringify(sanitizeProjectItems(data.items || data.line_items || data.services || [])),
          valorTotalMercanciaUsd,
          landFreightSale
        ];
        const upsertResult = await pool.query(upsertInsertQuery, upsertInsertValues);
        const upsertRow = upsertResult.rows[0];

        if (landOrigin || landDestination || landDistance != null || landFreightCost != null || routeAndChartering || valorTotalMercanciaUsd != null || landFreightSale != null) {
          try {
            const landUpdate = await pool.query(
              `UPDATE forwarder_projects
               SET land_origin = COALESCE($1, land_origin),
                   land_destination = COALESCE($2, land_destination),
                   land_distance = COALESCE($3, land_distance),
                   land_freight_cost = COALESCE($4, land_freight_cost),
                   route_and_chartering = COALESCE($6::jsonb, route_and_chartering),
                   valor_total_mercancia_usd = COALESCE($7, valor_total_mercancia_usd),
                   land_freight_sale = COALESCE($8, land_freight_sale)
               WHERE id = $5
               RETURNING *;`,
              [
                landOrigin,
                landDestination,
                landDistance,
                landFreightCost,
                upsertRow.id,
                routeAndChartering,
                valorTotalMercanciaUsd,
                landFreightSale
              ]
            );
            return {
              statusCode: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: 'Expediente creado con éxito (UPSERT)', project: sanitizeProjectResponseRow(landUpdate.rows[0] || upsertRow) })
            };
          } catch (_) {}
        }

        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Expediente creado con éxito (UPSERT)', project: sanitizeProjectResponseRow(upsertRow) })
        };
      }

      // MODO CREACIÓN (Nuevo Proyecto)
      const { client_name, status, documents, items, line_items, services, global_margin_percentage } = data;
      const projectRef = `EXP-${Date.now().toString().slice(-6)}`;
      const projectStatus = (status && typeof status === 'string' && status.trim()) ? status.trim() : 'BORRADOR';
      const marginPercentage = (global_margin_percentage !== undefined && global_margin_percentage !== null)
        ? String(global_margin_percentage)
        : '0';

      const insertQuery = `
        INSERT INTO forwarder_projects (project_ref, client_name, status, global_margin_percentage, documents, items, valor_total_mercancia_usd, land_freight_sale)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
        RETURNING *;
      `;
      const insertValues = [
        projectRef, 
        client_name || 'Nuevo Cliente', 
        projectStatus,
        marginPercentage,
        JSON.stringify(sanitizeDocuments(documents || [])),
        JSON.stringify(sanitizeProjectItems(items || line_items || services || [])),
        valorTotalMercanciaUsd,
        landFreightSale
      ];
      const result = await pool.query(insertQuery, insertValues);

      if (data.land_origin || data.land_destination || data.land_distance != null || data.land_freight_cost != null || data.route_and_chartering || data.routeAndChartering || valorTotalMercanciaUsd != null || landFreightSale != null) {
        try {
          const landUpdate = await pool.query(
            `UPDATE forwarder_projects
             SET land_origin = COALESCE($1, land_origin),
                 land_destination = COALESCE($2, land_destination),
                 land_distance = COALESCE($3, land_distance),
                 land_freight_cost = COALESCE($4, land_freight_cost),
                 route_and_chartering = COALESCE($6::jsonb, route_and_chartering),
                 valor_total_mercancia_usd = COALESCE($7, valor_total_mercancia_usd),
                 land_freight_sale = COALESCE($8, land_freight_sale)
             WHERE id = $5
             RETURNING *;`,
            [
              data.land_origin || null,
              data.land_destination || null,
              data.land_distance != null ? Number(data.land_distance) : null,
              data.land_freight_cost != null ? Number(data.land_freight_cost) : null,
              result.rows[0].id,
              (data.route_and_chartering || data.routeAndChartering) ? JSON.stringify(data.route_and_chartering || data.routeAndChartering) : null,
              valorTotalMercanciaUsd,
              landFreightSale
            ]
          );
          return {
            statusCode: 201,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'Expediente creado con éxito',
              project: sanitizeProjectResponseRow(landUpdate.rows[0] || result.rows[0])
            }),
          };
        } catch (_) {}
      }

      return {
        statusCode: 201,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Expediente creado con éxito',
          project: sanitizeProjectResponseRow(result.rows[0])
        }),
      };
    }

    // 2. ACTUALIZAR EXPEDIENTE ESTRICTO (PUT)
    if (httpMethod === 'PUT') {
      const data = JSON.parse(body || '{}');
      const valorTotalMercanciaUsd = (data.valor_total_mercancia_usd !== undefined && data.valor_total_mercancia_usd !== null)
        ? Number(data.valor_total_mercancia_usd)
        : ((data.valorTotalMercanciaUsd !== undefined && data.valorTotalMercanciaUsd !== null) ? Number(data.valorTotalMercanciaUsd) : null);
      const landFreightSale = (data.land_freight_sale !== undefined && data.land_freight_sale !== null)
        ? Number(data.land_freight_sale)
        : ((data.landFreightSale !== undefined && data.landFreightSale !== null) ? Number(data.landFreightSale) : null);
      
      const statusValue = (data.status !== undefined && data.status !== null && String(data.status).trim())
        ? String(data.status).trim()
        : null;
      const marginValue = (data.global_margin_percentage !== undefined && data.global_margin_percentage !== null)
        ? String(data.global_margin_percentage)
        : null;
      const landOrigin = data.land_origin !== undefined ? data.land_origin : null;
      const landDestination = data.land_destination !== undefined ? data.land_destination : null;
      const landDistance = data.land_distance !== undefined && data.land_distance !== null ? Number(data.land_distance) : null;
      const landFreightCost = data.land_freight_cost !== undefined && data.land_freight_cost !== null ? Number(data.land_freight_cost) : null;
      const routeAndChartering = (data.route_and_chartering !== undefined && data.route_and_chartering !== null)
        ? JSON.stringify(data.route_and_chartering)
        : ((data.routeAndChartering !== undefined && data.routeAndChartering !== null) ? JSON.stringify(data.routeAndChartering) : null);

      const query = `
        UPDATE forwarder_projects 
        SET documents = COALESCE($1::jsonb, documents),
            items = COALESCE($2::jsonb, items),
            client_name = COALESCE($3, client_name),
            status = COALESCE($6, status),
            global_margin_percentage = COALESCE($7, global_margin_percentage),
            land_origin = COALESCE($8, land_origin),
            land_destination = COALESCE($9, land_destination),
            land_distance = COALESCE($10, land_distance),
            land_freight_cost = COALESCE($11, land_freight_cost),
            route_and_chartering = COALESCE($12::jsonb, route_and_chartering),
            valor_total_mercancia_usd = COALESCE($13, valor_total_mercancia_usd),
            land_freight_sale = COALESCE($14, land_freight_sale)
        WHERE id = $4 OR project_ref = $5
        RETURNING *;
      `;
      const putSanitizedDocs = data.documents !== undefined ? sanitizeDocuments(data.documents) : null;
      const putRawItems = data.items || data.line_items || data.services;
      const putSanitizedItems = putRawItems !== undefined ? sanitizeProjectItems(putRawItems) : null;

      const values = [
        putSanitizedDocs !== null ? JSON.stringify(putSanitizedDocs) : null,
        putSanitizedItems !== null ? JSON.stringify(putSanitizedItems) : null,
        data.client_name || null,
        data.id ? parseInt(data.id, 10) : null,
        data.project_ref || null,
        statusValue,
        marginValue,
        landOrigin,
        landDestination,
        landDistance,
        landFreightCost,
        routeAndChartering,
        valorTotalMercanciaUsd,
        landFreightSale
      ];
      
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        if (data.project_ref) {
          // UPSERT para PUT: si no existe con project_ref, crearlo directamente
          const upsertRef = data.project_ref;
          const upsertStatus = statusValue || 'BORRADOR';
          const upsertMargin = marginValue || '0';

          const insertQuery = `
            INSERT INTO forwarder_projects (project_ref, client_name, status, global_margin_percentage, documents, items, valor_total_mercancia_usd, land_freight_sale)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
            RETURNING *;
          `;
          const insertValues = [
            upsertRef, 
            data.client_name || 'Nuevo Cliente', 
            upsertStatus,
            upsertMargin,
            JSON.stringify(sanitizeDocuments(data.documents || [])),
            JSON.stringify(sanitizeProjectItems(data.items || data.line_items || data.services || [])),
            valorTotalMercanciaUsd,
            landFreightSale
          ];
          const insertResult = await pool.query(insertQuery, insertValues);
          const createdProject = insertResult.rows[0];

          if (landOrigin || landDestination || landDistance != null || landFreightCost != null || routeAndChartering || valorTotalMercanciaUsd != null || landFreightSale != null) {
            try {
              const landUpdate = await pool.query(
                `UPDATE forwarder_projects
                 SET land_origin = COALESCE($1, land_origin),
                     land_destination = COALESCE($2, land_destination),
                     land_distance = COALESCE($3, land_distance),
                     land_freight_cost = COALESCE($4, land_freight_cost),
                     route_and_chartering = COALESCE($6::jsonb, route_and_chartering),
                     valor_total_mercancia_usd = COALESCE($7, valor_total_mercancia_usd),
                     land_freight_sale = COALESCE($8, land_freight_sale)
                 WHERE id = $5
                 RETURNING *;`,
                [
                  landOrigin,
                  landDestination,
                  landDistance,
                  landFreightCost,
                  createdProject.id,
                  routeAndChartering,
                  valorTotalMercanciaUsd,
                  landFreightSale
                ]
              );
              return {
                statusCode: 200,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Expediente actualizado con éxito (UPSERT)', project: sanitizeProjectResponseRow(landUpdate.rows[0] || createdProject) })
              };
            } catch (_) {}
          }

          return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Expediente actualizado con éxito (UPSERT)', project: sanitizeProjectResponseRow(createdProject) })
          };
        }

        return {
          statusCode: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Proyecto no encontrado para actualizar' })
        };
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Expediente actualizado con éxito',
          project: sanitizeProjectResponseRow(result.rows[0])
        }),
      };
    }

    // 3. LISTAR TODOS LOS EXPEDIENTES O UNO ESPECÍFICO (GET)
    if (httpMethod === 'GET') {
      const qParams = event.queryStringParameters || {};
      const targetRef = (qParams.project_ref || qParams.reference || qParams.ref || '').trim();
      const targetId = qParams.id && !isNaN(parseInt(qParams.id, 10)) ? parseInt(qParams.id, 10) : null;

      if (targetId || targetRef) {
        const singleQuery = `
          SELECT id, project_ref, client_name, status, global_margin_percentage, documents, items,
                 land_origin, land_destination, land_distance, land_freight_cost,
                 route_and_chartering,
                 valor_total_mercancia_usd, land_freight_sale,
                 TO_CHAR(created_at, 'DD/MM/YYYY') as date 
          FROM forwarder_projects 
          WHERE (id = $1 OR UPPER(project_ref) = UPPER($2))
          LIMIT 1;
        `;
        const singleResult = await pool.query(singleQuery, [targetId || 0, targetRef || '']);
        if (singleResult.rows.length === 0) {
          return {
            statusCode: 404,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Proyecto no encontrado' }),
          };
        }
        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify(sanitizeProjectResponseRow(singleResult.rows[0])),
        };
      }

      const query = `
        SELECT id, project_ref, client_name, status, global_margin_percentage, documents, items,
               land_origin, land_destination, land_distance, land_freight_cost,
               route_and_chartering,
               valor_total_mercancia_usd, land_freight_sale,
               TO_CHAR(created_at, 'DD/MM/YYYY') as date 
        FROM forwarder_projects 
        ORDER BY created_at DESC;
      `;
      const result = await pool.query(query);

      const sanitizedRows = (result.rows || []).map(sanitizeProjectResponseRow);

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedRows),
      };
    }

    // 4. ELIMINAR EXPEDIENTE (DELETE)
    if (httpMethod === 'DELETE') {
      let data = {};
      if (body) {
        try {
          data = typeof body === 'string' ? JSON.parse(body) : body;
        } catch (e) {
          data = {};
        }
      }
      const qParams = event.queryStringParameters || {};
      const id = data.id || qParams.id;
      const projectRef = data.project_ref || qParams.project_ref;

      if (!id && !projectRef) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Se requiere id o project_ref para eliminar el proyecto' })
        };
      }

      const parsedId = id && !isNaN(parseInt(id, 10)) ? parseInt(id, 10) : null;

      const deleteQuery = `
        DELETE FROM forwarder_projects 
        WHERE ($1::integer IS NOT NULL AND id = $1)
           OR ($2::text IS NOT NULL AND project_ref = $2)
        RETURNING *;
      `;
      const deleteValues = [parsedId, projectRef || null];
      const deleteResult = await pool.query(deleteQuery, deleteValues);

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: deleteResult.rowCount > 0 ? 'Expediente eliminado con éxito' : 'Proyecto no encontrado o ya eliminado',
          deletedCount: deleteResult.rowCount,
          project: deleteResult.rows[0] || null
        })
      };
    }

    return { 
      statusCode: 405, 
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };

  } catch (error) {
    console.error('Error crítico en forwarder-projects:', error);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Error interno del servidor' }),
    };
  }
};
