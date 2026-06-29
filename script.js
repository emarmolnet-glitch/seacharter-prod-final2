/** 
* SeaCharter Core PRO - Ultimate Matching Engine 
* Integration: Geofencing, Trust (GOLD/SILVER/BRONZE) and Operational Diagnostics. 
*/

console.log("SeaCharter Core PRO: Ultimate Engine Loaded.");

// 1. DISTANCE CALCULATION (GEOFENCING)
function calculateDistanceNM(lat1, lon1, lat2, lon2) { 
const R = 3440.065; 
const dLat = (lat2 - lat1) * Math.PI / 180; 
const dLon = (lon2 - lon1) * Math.PI / 180; 
const a = Math.sin(dLat / 2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2)**2; 
return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 2. PROCESSING ENGINE (THE MASTER LOGIC)
async function executeMatchMotor(RadarList) { 
const radarList = RadarList || [];
const BASE_PORT = { lat: 41.38, lon: 2.17 }; // Barcelona 
const MAX_RANGE = 300; 

return Promise.all(radarList.map(async (ship) => {
if (!ship) return null;

// Normalize coordinates to prevent undefined property access
const shipLat = ship.lat !== undefined ? ship.lat : (ship.latitude !== undefined ? ship.latitude : null);
const shipLon = ship.lon !== undefined ? ship.lon : (ship.longitude !== undefined ? ship.longitude : null);
if (shipLat === null || shipLon === null) return null;

const distance = calculateDistanceNM(BASE_PORT.lat, BASE_PORT.lon, shipLat, shipLon);
if (distance > MAX_RANGE) return null;

let level = (!ship.IMO || ship.IMO === "N/A" || ship.IMO === 0 || ship.IMO === "0") ? "BRONZE" : "GOLD";

const diagnosis = (level === "GOLD") ? await auditOperationAI(ship) : {
status: "PENDING",
last_port_detected: "N/A",
possible_destination: "N/A",
date_consistency: "NO"
};

return { 
...ship, 
lat: shipLat,
lon: shipLon,
distance, 
level, 
diagnosis,
// Compatibility fields for Spanish views and tests
nivel: level === "GOLD" ? "ORO" : "BRONCE",
nombre: ship.name || ship.vessel_name || ship.vesselName || ship.ShipName || "Unknown",
distancia: distance,
diagnostic: diagnosis,
diagnostico: diagnosis,
diagnostics: diagnosis
};

})).then(results => results.filter(b => b !== null));

}

// 3. VISUAL RENDERING
function renderFicha(buque) {
const colorBorde = buque.nivel === "ORO" ? "#2563eb" : "#ccc";
const ship = buque; // Safeguard definition to make ship.diagnostics completely safe
if (!ship.diagnostics) {
ship.diagnostics = buque.diagnostico || buque.diagnosis || {};
}

return `

<div class="ficha-buque" style="border: 2px solid ${colorBorde}; padding: 15px; margin: 10px; border-radius: 8px;">

<h3>${buque.nombre || "Buque"} | Confianza: ${buque.nivel}</h3>

<p><strong>Distancia:</strong> ${buque.distancia.toFixed(0)} NM</p>

<p><strong>Estado:</strong> ${buque.diagnostico.estado || "Under Tracking"}</p>

<p><strong>Last Port:</strong> ${ship.diagnostics.last_port_detected || "---"}</p>

<p><strong>Destination:</strong> ${ship.diagnostics.possible_destination || "---"}</p>

</div>
`;

}

// AI Diagnostic fetch helper using Gemini API via the /api/gemini endpoint
async function auditOperationAI(ship) {
const defaultResponse = {
status: "ACTIVE",
estado: "Navegando",
last_port_detected: "Barcelona",
possible_destination: "Valencia"
};

try {
const shipName = ship.name || ship.vessel_name || ship.ShipName || "Unknown";
const shipImo = ship.IMO || ship.imo || "N/A";
const shipLat = ship.lat !== undefined ? ship.lat : 0;
const shipLon = ship.lon !== undefined ? ship.lon : 0;

const prompt = `You are an AI maritime operations auditor. Generate a professional operational diagnostic for the vessel:
Name: ${shipName}
IMO: ${shipImo}
Coordinates: Lat ${shipLat}, Lon ${shipLon}

Respond ONLY with a valid JSON object in the following format (do not wrap in markdown blocks, return only pure raw JSON string):
{
  "status": "Active",
  "estado": "Navegando",
  "last_port_detected": "[Port Name]",
  "possible_destination": "[Port Name]"
}`;

const payload = {
contents: [{
parts: [{ text: prompt }]
}]
};

const response = await fetch('/api/gemini', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload)
});

if (!response.ok) {
return defaultResponse;
}

const data = await response.json();
const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) {
return defaultResponse;
}

const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
const parsed = JSON.parse(cleanedText);

return {
status: parsed.status || defaultResponse.status,
estado: parsed.estado || parsed.status || defaultResponse.estado,
last_port_detected: parsed.last_port_detected || defaultResponse.last_port_detected,
possible_destination: parsed.possible_destination || defaultResponse.possible_destination
};
} catch (err) {
return defaultResponse;
}
}

// Expose definitions globally and support Node.js exports for integration and test safety
const globalObj = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
globalObj.calculateDistanceNM = calculateDistanceNM;
globalObj.executeMatchMotor = executeMatchMotor;
globalObj.renderFicha = renderFicha;
globalObj.auditOperationAI = auditOperationAI;

if (typeof module !== 'undefined' && module.exports) {
module.exports = {
calculateDistanceNM,
executeMatchMotor,
renderFicha,
auditOperationAI
};
}
