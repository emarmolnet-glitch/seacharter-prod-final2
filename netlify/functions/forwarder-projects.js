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
      const data = JSON.parse(body);
      const { client_name } = data;
      
      // Generamos una referencia única simple (Ej: EXP-172554...)
      const projectRef = `EXP-${Date.now().toString().slice(-6)}`;

      const query = `
        INSERT INTO forwarder_projects (project_ref, client_name, status)
        VALUES ($1, $2, 'BORRADOR')
        RETURNING *;
      `;
      const values = [projectRef, client_name];
      const result = await pool.query(query, values);

      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Expediente creado con éxito',
          project: result.rows[0]
        }),
      };
    }

    // 2. LISTAR TODOS LOS EXPEDIENTES (GET)
    if (httpMethod === 'GET') {
      const query = `
        SELECT id, project_ref, client_name, status, global_margin_percentage, 
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

    // Método no soportado
    return { statusCode: 405, body: 'Method Not Allowed' };

  } catch (error) {
    console.error('Error en forwarder-projects:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor al procesar el expediente' }),
    };
  }
};
