import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(
  new URL("../src/components/ForwarderWorkspace.jsx", import.meta.url),
  "utf8"
);

test("ForwarderWorkspace includes '← Volver a Proyectos' button that resets activeProject", () => {
  // Verifies the button text
  assert.match(componentSource, /← Volver a Proyectos/);

  // Verifies the button resets active project state to null
  assert.match(componentSource, /setActiveProject\(null\)/);

  // Verifies clean styling (white background, subtle border, dark text, adequate padding)
  assert.match(componentSource, /px-3\s+py-2\s+text-xs\s+font-semibold\s+text-slate-700\s+bg-white\s+border\s+border-slate-300\s+rounded-lg\s+hover:bg-slate-50\s+shadow-sm\s+transition-colors\s+mr-2/);

  // Verifies the button is placed in the superior action bar above the control tower and packing list
  assert.match(
    componentSource,
    /BOTONES SUPERIORES[\s\S]*?← Volver a Proyectos[\s\S]*?torre-de-control-dashboard[\s\S]*?1\.\s*Lista de Empaque/
  );

  // Verifies the button is also placed in the bottom action bar after commercial/regulatory tools
  assert.match(
    componentSource,
    /Herramientas Comerciales y Regulatorias[\s\S]*?flex flex-wrap items-center gap-3 mt-8 mb-4[\s\S]*?← Volver a Proyectos/
  );

  // Verifies the button was removed from the immediate header of 1. Lista de Empaque
  const packingListSectionMatch = componentSource.match(/1\.\s*Lista de Empaque \(Packing List\)<\/h3>[\s\S]*?Importar PDF\/Excel/);
  assert.ok(packingListSectionMatch, 'Packing list header exists');
  assert.doesNotMatch(packingListSectionMatch[0], /← Volver a Proyectos/, 'No debe estar duplicado en la cabecera de la lista de empaque');
});
