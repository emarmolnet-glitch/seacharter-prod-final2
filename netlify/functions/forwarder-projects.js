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

const rawPool = new Pool({
  connectionString: connectionString || undefined,
  ssl: connectionString ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

rawPool.on('error', (err) => {
  console.error('⚠️ [forwarder-projects] Error imprevisto en cliente de pool de base de datos:', err);
});

// Proxied pool for backward compatibility, test assertions, and safe checkout/release
const pool = {
  query: (text, params) => executeSafeQuery(text, params),
  on: (event, handler) => rawPool.on(event, handler),
};

// Expose pool.on('error') pattern directly
pool.on('error', (err) => {
  console.error('⚠️ [forwarder-projects] Error imprevisto en pool:', err);
});

/**
 * Ejecuta una consulta SQL gestionando la adquisición y liberación explícita
 * de conexiones del pool, con control de timeout para evitar cuelgues o fugas.
 */
async function executeSafeQuery(text, params = []) {
  let client = null;
  try {
    client = await rawPool.connect();
    const result = await client.query(text, params);
    return result;
  } finally {
    if (client) {
      try {
        client.release();
      } catch (_e) {
        // Ignorar errores al liberar el cliente
      }
    }
  }
}

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
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS project_title VARCHAR(255);
      ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS description TEXT;
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
    project_title: row.project_title || row.projectTitle || null,
    description: row.description || null,
    documents: sanitizeDocuments(row.documents),
    items: sanitizeProjectItems(row.items)
  };
}

/**
 * Consolida los valores financieros de la flota completa recibidos desde el módulo terrestre Land Charter / Data Bridge.
 * Evita persistir tarifas unitarias de un solo camión si existen los importes totales consolidados o la multiplicación por flota.
 */
function extractConsolidatedLandValues(data) {
  if (!data || typeof data !== 'object') return { totalCost: 0, totalSale: 0, trucksNeeded: 1 };
  const items = Array.isArray(data.items)
    ? data.items
    : (Array.isArray(data.line_items)
        ? data.line_items
        : (Array.isArray(data.services) ? data.services : []));

  const landItem = items.find((it) => {
    if (!it || typeof it !== 'object') return false;
    const type = String(it.type || it.service_type || it.category || it.module || it.source || it.id || '').toLowerCase();
    const desc = String(it.description || it.name || it.title || it.concept || '').toLowerCase();
    return (
      type === 'land_charter' ||
      type.includes('land_charter') ||
      desc.includes('flete terrestre') ||
      desc.includes('transporte terrestre') ||
      it.is_land_charter === true ||
      it.is_transport === true
    );
  });

  const lcObj = data.land_charter || data.landCharter || {};
  const trucksNeeded = Number(
    landItem?.trucks_needed ??
    landItem?.trucksNeeded ??
    landItem?.trucks ??
    landItem?.truck_count ??
    landItem?.num_trucks ??
    landItem?.camiones ??
    lcObj.trucks_needed ??
    lcObj.trucksNeeded ??
    lcObj.trucks ??
    lcObj.truck_count ??
    lcObj.camiones ??
    data.trucks_needed ??
    data.trucksNeeded ??
    data.trucks ??
    data.camiones ??
    1
  ) || 1;

  let totalCost = Number(
    landItem?.total_cost ??
    landItem?.totalCost ??
    landItem?.total_cost_usd ??
    landItem?.total_cost_eur ??
    landItem?.payload_data?.total_cost ??
    landItem?.payload_data?.totalCost ??
    lcObj.total_cost ??
    lcObj.totalCost ??
    lcObj.total_cost_usd ??
    lcObj.total_cost_eur ??
    data.total_land_cost ??
    data.land_total_cost ??
    0
  );

  const unitCost = Number(
    landItem?.cost_eur ??
    landItem?.costEur ??
    landItem?.cost ??
    landItem?.cost_usd ??
    landItem?.costUsd ??
    landItem?.unit_cost ??
    landItem?.tarifa_camion ??
    lcObj.cost ??
    lcObj.freight_cost ??
    0
  );

  if (!totalCost && unitCost > 0 && trucksNeeded > 1) {
    totalCost = Math.round(unitCost * trucksNeeded * 100) / 100;
  }

  let totalSale = Number(
    landItem?.total_sale ??
    landItem?.totalSale ??
    landItem?.total_sale_usd ??
    landItem?.total_sale_eur ??
    landItem?.payload_data?.total_sale ??
    landItem?.payload_data?.totalSale ??
    lcObj.total_sale ??
    lcObj.totalSale ??
    lcObj.total_sale_usd ??
    lcObj.total_sale_eur ??
    data.total_land_sale ??
    data.land_total_sale ??
    0
  );

  const unitSale = Number(
    landItem?.sale_price_eur ??
    landItem?.salePriceEur ??
    landItem?.sale_price ??
    landItem?.salePrice ??
    landItem?.sale ??
    landItem?.sale_usd ??
    landItem?.unit_sale ??
    lcObj.sale ??
    lcObj.sale_price ??
    0
  );

  if (!totalSale && unitSale > 0 && trucksNeeded > 1) {
    totalSale = Math.round(unitSale * trucksNeeded * 100) / 100;
  }

  if (!totalSale && totalCost > 0) {
    totalSale = Math.round(totalCost * 1.15 * 100) / 100;
  }

  return { totalCost, totalSale, trucksNeeded };
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
      
      const consolidatedLand = extractConsolidatedLandValues(data);
      const rawPostLandCost = (data.land_freight_cost !== undefined && data.land_freight_cost !== null)
        ? Number(data.land_freight_cost)
        : (consolidatedLand.totalCost > 0 ? consolidatedLand.totalCost : null);
      const finalLandCost = consolidatedLand.totalCost > 0
        ? (rawPostLandCost === null || rawPostLandCost < consolidatedLand.totalCost ? consolidatedLand.totalCost : rawPostLandCost)
        : rawPostLandCost;
      const finalLandSale = consolidatedLand.totalSale > 0
        ? (landFreightSale === null || landFreightSale < consolidatedLand.totalSale ? consolidatedLand.totalSale : landFreightSale)
        : landFreightSale;

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
        const landFreightCost = finalLandCost;
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
          WHERE id = $4 OR project_ref = $5 OR (project_ref IS NOT NULL AND $5 IS NOT NULL AND UPPER(TRIM(project_ref)) = UPPER(TRIM($5)))
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
          finalLandSale
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
        const upsertRef = data.project_ref || `RDM/${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
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
      const projectRef = data.project_ref || `RDM/${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
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
      
      const consolidatedLand = extractConsolidatedLandValues(data);
      const rawPutLandCost = (data.land_freight_cost !== undefined && data.land_freight_cost !== null)
        ? Number(data.land_freight_cost)
        : (consolidatedLand.totalCost > 0 ? consolidatedLand.totalCost : null);
      const finalLandCost = consolidatedLand.totalCost > 0
        ? (rawPutLandCost === null || rawPutLandCost < consolidatedLand.totalCost ? consolidatedLand.totalCost : rawPutLandCost)
        : rawPutLandCost;
      const finalLandSale = consolidatedLand.totalSale > 0
        ? (landFreightSale === null || landFreightSale < consolidatedLand.totalSale ? consolidatedLand.totalSale : landFreightSale)
        : landFreightSale;

      const statusValue = (data.status !== undefined && data.status !== null && String(data.status).trim())
        ? String(data.status).trim()
        : null;
      const marginValue = (data.global_margin_percentage !== undefined && data.global_margin_percentage !== null)
        ? String(data.global_margin_percentage)
        : null;
      const landOrigin = data.land_origin !== undefined ? data.land_origin : null;
      const landDestination = data.land_destination !== undefined ? data.land_destination : null;
      const landDistance = data.land_distance !== undefined && data.land_distance !== null ? Number(data.land_distance) : null;
      const landFreightCost = finalLandCost;
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
        WHERE id = $4 OR project_ref = $5 OR (project_ref IS NOT NULL AND $5 IS NOT NULL AND UPPER(TRIM(project_ref)) = UPPER(TRIM($5)))
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
        finalLandSale
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
            finalLandSale
          ];
          const insertResult = await pool.query(insertQuery, insertValues);
          const createdProject = insertResult.rows[0];

          if (landOrigin || landDestination || landDistance != null || landFreightCost != null || routeAndChartering || valorTotalMercanciaUsd != null || finalLandSale != null) {
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
                  finalLandSale
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
          SELECT id, project_ref, project_title, description, client_name, status, global_margin_percentage, documents, items,
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
        SELECT id, project_ref, project_title, description, client_name, status, global_margin_percentage,
               land_origin, land_destination, land_distance, land_freight_cost,
               route_and_chartering,
               valor_total_mercancia_usd, land_freight_sale,
               TO_CHAR(created_at, 'DD/MM/YYYY') as date,
               created_at, updated_at
        FROM forwarder_projects 
        ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
        LIMIT 50;
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

    const errorMessage = error?.message || 'Error interno del servidor';
    const isTimeout = /timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|Connection terminated/i.test(errorMessage);
    const isNetworkOrDbUnavailable = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|57P01|57P02|57P03|08000|08003|08006|Connection terminated|connection timeout/i.test(errorMessage);

    // Evitar colapsos 502 brutos: devolver respuesta JSON estructurada y código HTTP adecuado
    const statusCode = (isTimeout || isNetworkOrDbUnavailable) ? 503 : 500;

    return {
      statusCode,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...(statusCode === 503 ? { 'Retry-After': '5' } : {})
      },
      body: JSON.stringify({
        success: false,
        error: isTimeout
          ? 'Tiempo de espera agotado al conectar con la base de datos Neon. Reintentando...'
          : (isNetworkOrDbUnavailable
            ? 'Servicio de base de datos Neon temporalmente no disponible.'
            : errorMessage),
        code: isTimeout ? 'DB_TIMEOUT' : (isNetworkOrDbUnavailable ? 'DB_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR'),
        timestamp: new Date().toISOString()
      }),
    };
  }
};
