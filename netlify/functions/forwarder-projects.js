const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
    `);
    schemaEnsured = true;
  } catch (_err) {
    // Ignore in offline or mock test environments
  }
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
              land_freight_cost = COALESCE($11, land_freight_cost)
          WHERE id = $4 OR project_ref = $5
          RETURNING *;
        `;
        const updateValues = [
          data.documents !== undefined ? JSON.stringify(data.documents) : null,
          (data.items || data.line_items || data.services) !== undefined
            ? JSON.stringify(data.items || data.line_items || data.services)
            : null,
          data.client_name || null,
          data.id ? parseInt(data.id, 10) : null,
          data.project_ref || null,
          statusValue,
          marginValue,
          landOrigin,
          landDestination,
          landDistance,
          landFreightCost
        ];
        const updateResult = await pool.query(updateQuery, updateValues);
        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Expediente actualizado con éxito', project: updateResult.rows[0] })
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
        INSERT INTO forwarder_projects (project_ref, client_name, status, global_margin_percentage, documents, items)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        RETURNING *;
      `;
      const insertValues = [
        projectRef, 
        client_name || 'Nuevo Cliente', 
        projectStatus,
        marginPercentage,
        JSON.stringify(documents || []),
        JSON.stringify(items || line_items || services || [])
      ];
      const result = await pool.query(insertQuery, insertValues);

      if (data.land_origin || data.land_destination || data.land_distance != null || data.land_freight_cost != null) {
        try {
          const landUpdate = await pool.query(
            `UPDATE forwarder_projects
             SET land_origin = COALESCE($1, land_origin),
                 land_destination = COALESCE($2, land_destination),
                 land_distance = COALESCE($3, land_distance),
                 land_freight_cost = COALESCE($4, land_freight_cost)
             WHERE id = $5
             RETURNING *;`,
            [
              data.land_origin || null,
              data.land_destination || null,
              data.land_distance != null ? Number(data.land_distance) : null,
              data.land_freight_cost != null ? Number(data.land_freight_cost) : null,
              result.rows[0].id
            ]
          );
          return {
            statusCode: 201,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'Expediente creado con éxito',
              project: landUpdate.rows[0] || result.rows[0]
            }),
          };
        } catch (_) {}
      }

      return {
        statusCode: 201,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Expediente creado con éxito',
          project: result.rows[0]
        }),
      };
    }

    // 2. ACTUALIZAR EXPEDIENTE ESTRICTO (PUT)
    if (httpMethod === 'PUT') {
      const data = JSON.parse(body || '{}');
      
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
            land_freight_cost = COALESCE($11, land_freight_cost)
        WHERE id = $4 OR project_ref = $5
        RETURNING *;
      `;
      const values = [
        data.documents !== undefined ? JSON.stringify(data.documents) : null,
        (data.items || data.line_items || data.services) !== undefined
          ? JSON.stringify(data.items || data.line_items || data.services)
          : null,
        data.client_name || null,
        data.id ? parseInt(data.id, 10) : null,
        data.project_ref || null,
        statusValue,
        marginValue,
        landOrigin,
        landDestination,
        landDistance,
        landFreightCost
      ];
      
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
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
          project: result.rows[0]
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
          body: JSON.stringify(singleResult.rows[0]),
        };
      }

      const query = `
        SELECT id, project_ref, client_name, status, global_margin_percentage, documents, items,
               land_origin, land_destination, land_distance, land_freight_cost,
               TO_CHAR(created_at, 'DD/MM/YYYY') as date 
        FROM forwarder_projects 
        ORDER BY created_at DESC;
      `;
      const result = await pool.query(query);

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(result.rows),
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
