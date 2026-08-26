const { Client } = require('pg');

export const handler = async (event, context) => {
    // Nos conectamos a tu base de datos Neon usando la variable de entorno
    const client = new Client({
        connectionString: process.env.DATABASE_URL, // Asegúrate de que esta variable existe en Netlify
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        // Ejecutamos la consulta con DISTINCT ON para sacar los últimos precios
        const query = `
            SELECT DISTINCT ON (fuel_grade) 
                fuel_grade, price, hub_name, created_at
            FROM bunker_prices_log
            WHERE fuel_grade IN ('VLSFO', 'IFO380', 'MGO')
            ORDER BY fuel_grade, created_at DESC;
        `;
        
        const result = await client.query(query);

        // Mapeamos el resultado para devolver un JSON limpio al frontend
        const bunkerData = {};
        result.rows.forEach(row => {
            bunkerData[row.fuel_grade] = {
                price: parseFloat(row.price),
                hub: row.hub_name,
                date: row.created_at
            };
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bunkerData)
        };
    } catch (error) {
        console.error("Error leyendo bunker_prices_log de Neon:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Fallo al sincronizar precios de búnker' })
        };
    } finally {
        await client.end();
    }
};
