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
  assert.match(componentSource, /onClick=\{[^{}]*setActiveProject\(null\)[^{}]*\}/);

  // Verifies the button is placed inside the header of the active project view
  assert.match(
    componentSource,
    /<header[\s\S]*?← Volver a Proyectos[\s\S]*?<\/header>/
  );
});
