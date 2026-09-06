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

  // Verifies the button is placed right before "Importar PDF/Excel" in section "1. Lista de Empaque"
  assert.match(
    componentSource,
    /1\.\s*Lista de Empaque[\s\S]*?← Volver a Proyectos[\s\S]*?Importar PDF\/Excel/
  );
});
