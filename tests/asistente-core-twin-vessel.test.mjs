import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildVesselRescueMessage,
  evaluateVesselAvailability,
  isNoVesselsError,
} from "../src/utils/twin-vessel-rescue.mjs";

const frontendSource = await readFile(new URL("../src/sea-assistant-entry.js", import.meta.url), "utf8");
const stylesheetSource = await readFile(new URL("../assets/css/sea-assistant.css", import.meta.url), "utf8");
const reactComponentSource = await readFile(new URL("../src/components/AsistenteCore.jsx", import.meta.url), "utf8");

test("1. buildVesselRescueMessage outputs the exact required twin vessel rescue template", () => {
  const defaultMsg = buildVesselRescueMessage({});
  
  assert.match(defaultMsg, /⚠️ \*\*Alerta de Radar: Sin disponibilidad en zona\*\*/);
  assert.match(defaultMsg, /No hemos encontrado un barco operando en las zonas de POL y POD que se ajuste a las fechas de tu \*laycan\*\./);
  assert.match(defaultMsg, /⚡ \*\*Solución de Cotización \(Buque Gemelo\):\*\*/);
  assert.match(defaultMsg, /Para que no paralices la proforma y puedas cotizar a tu cliente con total precisión, te recomendamos utilizar un \*\*BARCO GEMELO\*\*\./);
  assert.match(defaultMsg, /💡 \*\*Acción requerida:\*\*/);
  assert.match(defaultMsg, /Abre el módulo \*\*Data Bridge\*\* en el panel lateral\./);
  assert.match(defaultMsg, /La sesión se sincronizará automáticamente\./);
  assert.match(defaultMsg, /Pídele a MADRE que localice el barco idóneo en la base de datos, revisa sus fotos verificadas y haz clic en "Calcular en Core PRO" para inyectar su IMO aquí\./);
});

test("2. buildVesselRescueMessage interpolates estimation variables (tonnage, POL, POD, laycan)", () => {
  const context = {
    pol: "Rotterdam",
    pod: "Houston",
    tonnage: 35000,
    laydayStart: "2026-11-01",
    cancelling: "2026-11-10",
  };
  const interpolated = buildVesselRescueMessage(context);

  assert.match(interpolated, /las zonas de POL \(Rotterdam\) y POD \(Houston\)/);
  assert.match(interpolated, /tu \*laycan\* \(2026-11-01 - 2026-11-10\)/);
  assert.match(interpolated, /la proforma \(35\.000 MT\)/);
  assert.match(interpolated, /BARCO GEMELO/);
});

test("3. evaluateVesselAvailability detects empty or non-viable vessel status", async () => {
  // Empty vessels array
  const emptyRes = await evaluateVesselAvailability({ actionResult: { vessels: [] } });
  assert.equal(emptyRes.hasViableVessels, false);
  assert.equal(emptyRes.status, "empty");

  // Non-compliant laycan
  const nonCompliantRes = await evaluateVesselAvailability({
    actionResult: {
      vessels: [{ name: "VESSEL A", laycanCompliant: false, compatibilityScore: 0 }],
    },
  });
  assert.equal(nonCompliantRes.hasViableVessels, false);

  // Compliant viable vessel
  const viableRes = await evaluateVesselAvailability({
    actionResult: {
      vessels: [{ name: "VESSEL B", laycanCompliant: true, compatibilityScore: 85 }],
    },
  });
  assert.equal(viableRes.hasViableVessels, true);
  assert.equal(viableRes.status, "available");
});

test("4. isNoVesselsError correctly identifies lack of availability errors to omit generic errors", () => {
  assert.equal(isNoVesselsError({ code: "NO_VESSELS_AVAILABLE" }), true);
  assert.equal(isNoVesselsError({ error: "Sin disponibilidad de buques en zona" }), true);
  assert.equal(isNoVesselsError({ message: "No hemos encontrado un barco para este laycan" }), true);
  assert.equal(isNoVesselsError("No hay buques en la zona POL/POD"), true);
  assert.equal(isNoVesselsError({ message: "Syntax error in query" }), false);
});

test("5. sea-assistant-entry.js intercepts lack of availability and injects the rescue message", () => {
  // Check that post-calculation evaluation evaluates vessel availability
  assert.match(frontendSource, /evaluateVesselAvailability\(\{ action, actionResult, response \}\)/);
  // Check that when not viable, it calls agregarMensajeAsistente with rescueMsg
  assert.match(frontendSource, /buildVesselRescueMessage\(\{[\s\S]*pol:[\s\S]*pod:[\s\S]*tonnage:[\s\S]*\}\)/);
  assert.match(frontendSource, /agregarMensajeAsistente\(rescueMsg\)/);
  // Check that generic errors are omitted when vessel validation returns empty/null
  assert.match(frontendSource, /if \(isNoVesselsError\(error\)\) \{[\s\S]*replaceWithAssistantMessage\(thinkingMessage, rescueMsg/);
});

test("6. Markdown rendering and visual CTA support for rescue messages", () => {
  // Check marked and DOMPurify with Markdown rendering on assistant rescue messages
  assert.match(frontendSource, /isRescue/);
  assert.match(frontendSource, /sca-message--rescue/);
  assert.match(frontendSource, /sca-cta-databridge-btn/);
  assert.match(frontendSource, /Abrir Data Bridge/);

  // Stylesheet includes call to action and rescue highlights
  assert.match(stylesheetSource, /\.sca-message--rescue \.sca-bubble/);
  assert.match(stylesheetSource, /\.sca-cta-databridge-btn/);
  assert.match(stylesheetSource, /border-left:\s*4px solid #f59e0b/);
});

test("7. AsistenteCore React component and state manager exports exist and bridge properly", () => {
  assert.match(reactComponentSource, /export default function AsistenteCore/);
  assert.match(reactComponentSource, /export function useAsistenteCore/);
  assert.match(reactComponentSource, /agregarMensajeAsistente/);
  assert.match(reactComponentSource, /buildVesselRescueMessage/);
  assert.match(reactComponentSource, /evaluateVesselAvailability/);
});
