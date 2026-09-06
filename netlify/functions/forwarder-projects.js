const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

exports.handler = async (event) => {
  const { httpMethod, body } = event;

  try {
    // 1. CREAR UN NUEVO EXPEDIENTE (POST)
    if (httpMethod === 'POST') {
      const data = JSON.parse(body || '{}');
      
      if (data.id || data.project_ref) {
        const updateQuery = `
          UPDATE forwarder_projects 
          SET documents = $1::jsonb,
              items = $2::jsonb,
              client_name = COALESCE($3, client_name)
          WHERE id = $4 OR project_ref = $5
          RETURNING *;
        `;
        const updateValues = [
          JSON.stringify(data.documents || []),
          JSON.stringify(data.items || data.line_items || data.services || []),
          data.client_name || null,
          data.id ? parseInt(data.id, 10) : null,
          data.project_ref || null
        ];
        const updateResult = await pool.query(updateQuery, updateValues);
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Expediente actualizado con éxito', project: updateResult.rows[0] })
        };
      }

      const { client_name, documents } = data;
      const projectRef = `EXP-${Date.now().toString().slice(-6)}`;

      const insertQuery = `
        INSERT INTO forwarder_projects (project_ref, client_name, status, documents, items)
        VALUES ($1, $2, 'BORRADOR', $3::jsonb, $4::jsonb)
        RETURNING *;
      `;
      const insertValues = [
        projectRef, 
        client_name || 'Nuevo Cliente', 
        JSON.stringify(documents || []),
        JSON.stringify([])
      ];
      const result = await pool.query(insertQuery, insertValues);

      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Expediente creado con éxito',
          project: result.rows[0]
        }),
      };
    }

    // 2. ACTUALIZAR EXPEDIENTE (PUT)
    if (httpMethod === 'PUT') {
      const data = JSON.parse(body || '{}');
      
      const query = `
        UPDATE forwarder_projects 
        SET documents = $1::jsonb,
            items = $2::jsonb,
            client_name = COALESCE($3, client_name)
        WHERE id = $4 OR project_ref = $5
        RETURNING *;
      `;
      const values = [
        JSON.stringify(data.documents || []),
        JSON.stringify(data.items || data.line_items || data.services || []),
        data.client_name || null,
        data.id ? parseInt(data.id, 10) : null,
        data.project_ref || null
      ];
      
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Proyecto no encontrado para actualizar' })
        };
      }

      return {
        statusCode: 200,
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
        body: JSON.stringify(result.rows),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };

  } catch (error) {
    console.error('Error crítico en forwarder-projects:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Error interno del servidor' }),
    };
  }
};
