export default async function proxyRequest(request) {
    // 🔴 ESTA ES LA URL REAL DE TU BACKEND (DATA BRIDGE)
    const BACKEND_URL = "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/cerebro-ia";

    // 1. Manejar las peticiones de seguridad CORS del navegador
    if (request.method === "OPTIONS") {
        return new Response("ok", { 
            status: 200, 
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS"
            } 
        });
    }

    try {
        // 2. Extraer el Content-Type original (Vital para que no se rompan los PDFs)
        const contentType = request.headers.get("content-type");
        
        const fetchOptions = {
            method: request.method,
            headers: {},
        };

        if (contentType) {
            fetchOptions.headers["Content-Type"] = contentType;
        }

        // 3. Extraer el cuerpo de la petición de forma binaria para soportar archivos
        if (request.method === "POST") {
            fetchOptions.body = await request.arrayBuffer();
        }

        // 4. Reenviar todo al cerebro real en Data Bridge
        const response = await fetch(BACKEND_URL, fetchOptions);
        
        // 5. Capturar la respuesta de Data Bridge
        const responseData = await response.text();

        // 6. Devolverla intacta a Core PRO
        return new Response(responseData, {
            status: response.status,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            }
        });

    } catch (error) {
        console.error("[Proxy Core PRO] Error conectando con Data Bridge:", error);
        return new Response(JSON.stringify({
            success: false,
            intent: "ERROR",
            action: "none",
            respuesta: "Error de conexión: El frontend no pudo alcanzar el servidor Data Bridge.",
            payload: {}
        }), { 
            status: 500, 
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*" 
            } 
        });
    }
}
