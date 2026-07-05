export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const datosBuques = JSON.parse(event.body);

    // Aquí es donde "disparamos" la información hacia el Data Bridge
    const respuesta = await fetch('https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/receive-audit', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
        // Si tienes API_SECRET, agrégalo aquí
      },
      body: JSON.stringify(datosBuques)
    });

    return { 
      statusCode: 200, 
      body: JSON.stringify({ message: "Buques enviados al Data Bridge con éxito" }) 
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};