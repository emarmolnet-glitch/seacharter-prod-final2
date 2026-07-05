export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const datosBuques = JSON.parse(event.body);
    
    // Añadimos 'await' aquí para que la función espere a que se envíen los datos
    const respuesta = await fetch('https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/receive-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosBuques)
    });

    const resultado = await respuesta.json();

    return { 
      statusCode: 200, 
      body: JSON.stringify({ message: "Enviado", detalle: resultado }) 
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }