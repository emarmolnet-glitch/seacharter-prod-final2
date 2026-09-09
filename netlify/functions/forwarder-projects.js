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
};

exports.handler = async (event) => {
  const { httpMethod, body } = event;

  // 0. Interceptar peticiones OPTIONS (CORS preflight)
  if (httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    // 1. CREAR O ACTUALIZAR UN EXPEDIENTE (POST)
    if (httpMethod === 'POST') {
      const data = JSON.parse(body || '{}');
      
      // MODO ACTUALIZACIÓN (Si ya existe ID o REF)
      if (data.id || data.project_ref) {
        const updateQuery = `
          UPDATE forwarder_projects 
          SET documents = $1::jsonb,
              items = $2::jsonb,
              client_name = COALESCE($3, client_name),
              status = COALESCE($6, status),
              global_margin_percentage = COALESCE($7, global_margin_percentage)
          WHERE id = $4 OR project_ref = $5
          RETURNING *;
        `;
        const updateValues = [
          JSON.stringify(data.documents || []),
          JSON.stringify(data.items || data.line_items || data.services || []),
          data.client_name || null,
          data.id ? parseInt(data.id, 10) : null,
          data.project_ref || null,
          data.status || null,                 // AÑADIDO: Guardar el estado
          data.global_margin_percentage || '0' // AÑADIDO: Guardar el margen
        ];
        const updateResult = await pool.query(updateQuery, updateValues);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'Expediente actualizado con éxito', project: updateResult.rows[0] })
        };
      }

      // MODO CREACIÓN (Nuevo Proyecto)
      const { client_name, documents, items, global_margin_percentage } = data;
      const projectRef = `EXP-${Date.now().toString().slice(-6)}`;

      const insertQuery = `
        INSERT INTO forwarder_projects (project_ref, client_name, status, global_margin_percentage, documents, items)
        VALUES ($1, $2, 'BORRADOR', $3, $4::jsonb, $5::jsonb)
        RETURNING *;
      `;
      const insertValues = [
        projectRef, 
        client_name || 'Nuevo Cliente', 
        global_margin_percentage || '0', // Guardar el margen inicial
        JSON.stringify(documents || []),
        JSON.stringify(items || [])
      ];
      const result = await pool.query(insertQuery, insertValues);

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Expediente creado con éxito',
          project: result.rows[0]
        }),
      };
    }

    // 2. ACTUALIZAR EXPEDIENTE ESTRICTO (PUT)
    if (httpMethod === 'PUT') {
      const data = JSON.parse(body || '{}');
      
      const query = `
        UPDATE forwarder_projects 
        SET documents = $1::jsonb,
            items = $2::jsonb,
            client_name = COALESCE($3, client_name),
            status = COALESCE($6, status),
            global_margin_percentage = COALESCE($7, global_margin_percentage)
        WHERE id = $4 OR project_ref = $5
        RETURNING *;
      `;
      const values = [
        JSON.stringify(data.documents || []),
        JSON.stringify(data.items || data.line_items || data.services || []),
        data.client_name || null,
        data.id ? parseInt(data.id, 10) : null,
        data.project_ref || null,
        data.status || null,
        data.global_margin_percentage || null
      ];
      
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Proyecto no encontrado para actualizar' })
        };
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Expediente actualizado con éxito',
          project: result.rows[0]
        }),
      };
    }

    // 3. LISTAR TODOS LOS EXPEDIENTES (GET)
    if (httpMethod === 'GET') {
      const query = `
        SELECT id, project_ref, client_name, status, global_margin_percentage, documents, items,
               TO_CHAR(created_at, 'DD/MM/YYYY') as date 
        FROM forwarder_projects 
        ORDER BY created_at DESC;
      `;
      const result = await pool.query(query);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
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
      headers: CORS_HEADERS, 
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };

  } catch (error) {
    console.error('Error crítico en forwarder-projects:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message || 'Error interno del servidor' }),
    };
  }
};
