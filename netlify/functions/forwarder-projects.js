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
      
      // Si la petición POST trae un ID o project_ref, actúa como actualización (upsert)
      if (data.id || data.project_ref) {
        const updateQuery = `
          UPDATE forwarder_projects 
          SET documents = COALESCE($1, documents),
              items = COALESCE($2, items),
              client_name = COALESCE($3, client_name)
          WHERE id = $4 OR project_ref = $5
          RETURNING *;
        `;
        const updateValues = [
          JSON.stringify(data.documents || []),
          JSON.stringify(data.items || data.line_items || []),
          data.client_name,
          data.id || null,
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
        INSERT INTO forwarder_projects (project_ref, client_name, status, documents)
        VALUES ($1, $2, 'BORRADOR', $3)
        RETURNING *;
      `;
      const insertValues = [projectRef, client_name, JSON.stringify(documents || [])];
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
        SET documents = $1,
            items = COALESCE($2, items),
            client_name = COALESCE($3, client_name)
        WHERE id = $4 OR project_ref = $5
        RETURNING *;
      `;
      const values = [
        JSON.stringify(data.documents || []),
        JSON.stringify(data.items || data.line_items || []),
        data.client_name,
        data.id || null,
        data.project_ref || null
      ];
      const result = await pool.query(query, values);

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
    console.error('Error en forwarder-projects:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor al procesar el expediente' }),
    };
  }
};
