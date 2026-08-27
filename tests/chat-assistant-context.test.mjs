import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const dataBridgeToolingSource = await readFile(new URL('../netlify/functions/_shared/data-bridge-tooling.mjs', import.meta.url), 'utf8');
const weatherToolingSource = await readFile(new URL('../netlify/functions/_shared/weather-tooling.mjs', import.meta.url), 'utf8');
const assistantStyles = await readFile(new URL('../assets/css/sea-assistant.css', import.meta.url), 'utf8');
const overlaySource = await readFile(new URL('../dual-mode-overlay.js', import.meta.url), 'utf8');

test('chat assistant sends the unified Data Bridge context with each message', () => {
  assert.match(frontendSource, /function collectChatContext\(\)/);
  assert.match(frontendSource, /const activeModule = getActiveModule\(\)/);
  assert.match(frontendSource, /modulo: activeModule/);
  assert.match(frontendSource, /moduloId: activeModuleDescriptor\.id/);
  assert.match(frontendSource, /datosModulo: moduleScreenContext/);
  assert.match(frontendSource, /sugerenciasProactivas: proactiveEvaluation\.issues/);
  assert.match(frontendSource, /rol: roleMode === "charterer"/);
  assert.match(frontendSource, /operativos: \{/);
  assert.match(frontendSource, /financieros: \{/);
  assert.match(frontendSource, /contrato: \{/);
  assert.match(frontendSource, /meteorologia: weatherSnapshot/);
  assert.match(frontendSource, /function collectCalculationData\(\)/);
  assert.match(frontendSource, /function collectMarketData\(\)/);
  assert.match(frontendSource, /packaging: firstText/);
  assert.match(frontendSource, /freightSellUsdTon: firstNumber/);
  assert.match(frontendSource, /loadingLaytime: firstText/);
  assert.match(frontendSource, /bdi: firstNumber/);
  assert.match(frontendSource, /vlsfoUsdTon: firstNumber/);
  assert.match(frontendSource, /mgoUsdTon: firstNumber/);
  assert.match(frontendSource, /CalculationData: collectCalculationData\(\)/);
  assert.match(frontendSource, /MarketData: collectMarketData\(\)/);
  assert.match(frontendSource, /UserContext: userText/);
  assert.match(frontendSource, /const userText = input\.value;/);
  assert.match(frontendSource, /ConversationHistory: historial/);
  assert.match(frontendSource, /const sanitizedPayload = sanitizePayloadForAI\(requestPayload\)/);
  assert.match(frontendSource, /JSON\.stringify\(sanitizedPayload\)/);
  assert.match(frontendSource, /DEFAULT_CEREBRO_IA_ENDPOINT = "\/api\/cerebro-ia"/);
  assert.doesNotMatch(frontendSource, /const CHAT_ENDPOINT = "\/\.netlify\/functions\/chat-assistant"/);
});

test('chat assistant prioritizes informe while preserving response key compatibility', () => {
  assert.match(frontendSource, /const candidates = \[\s*payload\?\.informe,\s*payload\?\.reply,\s*payload\?\.message,/);
  assert.match(frontendSource, /payload\?\.data\?\.informe/);
  assert.match(frontendSource, /const respuesta = candidates\.find/);
});

test('chat assistant stays operable and contextual while Dual Mode is open', () => {
  assert.match(frontendSource, /function getDualModeContext\(\)/);
  assert.match(frontendSource, /#dual-mode-overlay dual-trading-chartering-view/);
  assert.match(frontendSource, /dualView\?\.getAssistantContext\?\.\(\)/);
  assert.match(frontendSource, /\.\.\.\(dualModeContext \? \{ modoDual: dualModeContext \} : \{\}\)/);
  assert.match(frontendSource, /window\.addEventListener\("sea-assistant:open", openFromContext\)/);
  assert.match(frontendSource, /input\.setSelectionRange\(input\.value\.length, input\.value\.length\)/);
  assert.match(assistantStyles, /z-index:\s*2147483500/);
  assert.match(overlaySource, /event\.target instanceof Element && event\.target\.closest\('\.sca-root'\)/);
});

test('chat assistant builds a dynamic maritime risk audit instruction', () => {
  assert.match(backendSource, /const \{ mensaje, contexto = \{\} \} = await req\.json\(\)/);
  assert.match(backendSource, /Contexto actual de la pantalla del usuario/);
  assert.match(backendSource, /JSON\.stringify\(contexto, null, 2\)/);
  assert.match(backendSource, /Reglas Críticas de Análisis y Proactividad/);
  assert.match(backendSource, /Contexto Dinámico y Financiero/);
  assert.match(backendSource, /Optimización de Operaciones Portuarias \(Eficiencia vs\. Coste\)/);
  assert.match(backendSource, /Defensa en Negociaciones Comerciales \(Llamar el Farol\)/);
  assert.match(backendSource, /Precio COA \(Contract of Affreightment\)/);
  assert.match(backendSource, /Precio Backhaul \(Viaje de Retorno\)/);
  assert.match(backendSource, /Asesoramiento en Modo Dual \(Trading & Chartering - Margen y Competitividad\)/);
  assert.match(backendSource, /Análisis Universal por Módulo/);
  assert.match(backendSource, /contexto\.datosModulo/);
  assert.match(backendSource, /Palanca FOB \(Compra\)/);
  assert.match(backendSource, /Palanca de Flete/);
  assert.match(backendSource, /Palanca CIF \(Venta\)/);
  assert.match(backendSource, /Columna A \(Trading: FOB, CIF, Tolerancia\)/);
  assert.match(backendSource, /Columna B \(Fletamento: Margen Bruto y Flete\)/);
  assert.match(backendSource, /DATA_BRIDGE_SYSTEM_PROMPT/);
  assert.match(backendSource, /Eres un Consultor Marítimo integral/);
  assert.match(backendSource, /Tienes acceso directo a los datos meteorológicos de la plataforma/);
  assert.match(backendSource, /Nunca rechaces una consulta meteorológica por restricciones de rol/);
  assert.match(backendSource, /posibles demoras o suspensiones de laytime por lluvia/);
  assert.match(backendSource, /contexto\.meteorologia/);
  assert.match(backendSource, /systemInstruction: finalInstruction/);
  assert.match(backendSource, /CHAT_ASSISTANT_MODEL = "gemini-3\.1-pro-preview"/);
  assert.match(backendSource, /model: CHAT_ASSISTANT_MODEL/);
});

test('chat assistant injects the Neon ecosystem dictionary and exposes safe tool calling', () => {
  assert.match(dataBridgeToolingSource, /Eres el cerebro analítico de SeaCharter Core PRO/);
  assert.match(dataBridgeToolingSource, /Data Bridge \(Neon PostgreSQL\)/);
  assert.match(dataBridgeToolingSource, /bunker_prices_log/);
  assert.match(dataBridgeToolingSource, /market_spot_rates/);
  assert.match(dataBridgeToolingSource, /market_ffa_rates/);
  assert.match(dataBridgeToolingSource, /Eficiencia_Mercado/);
  assert.match(dataBridgeToolingSource, /market_average_speeds/);
  assert.match(dataBridgeToolingSource, /average_speed_knots/);
  assert.match(dataBridgeToolingSource, /ais_vessels/);
  assert.match(dataBridgeToolingSource, /vessels_master/);
  assert.match(dataBridgeToolingSource, /voyages_tracking/);
  assert.match(dataBridgeToolingSource, /pda_vessel_confirmations/);
  assert.match(dataBridgeToolingSource, /name: "consultar_data_bridge"/);
  assert.match(dataBridgeToolingSource, /vessels_master SOLAMENTE/);
  assert.match(dataBridgeToolingSource, /market_average_speeds SOLAMENTE/);
  assert.match(backendSource, /tools: \[\.\.\.DATA_BRIDGE_TOOLS, \.\.\.WEATHER_TOOLS\]/);
  assert.match(backendSource, /result\.response\.functionCalls\(\)/);
  assert.match(backendSource, /executeDataBridgeTool\(functionCall\)/);
  assert.match(weatherToolingSource, /name: "getWeatherForecast"/);
  assert.match(weatherToolingSource, /impacto meteorológico en carga, descarga, demoras o laytime/);
  assert.match(backendSource, /tools: \[\.\.\.DATA_BRIDGE_TOOLS, \.\.\.WEATHER_TOOLS\]/);
  assert.match(backendSource, /executeWeatherTool\(functionCall, normalizedContext\)/);
});
