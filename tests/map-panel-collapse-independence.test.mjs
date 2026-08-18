import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync("index.html", "utf8");
const nlpWidgetSource = fs.readFileSync("src/components/NLPInputWidget.jsx", "utf8");

test("geographic input collapse targets only its own overlay", () => {
  assert.match(pageSource, /\.map-command-shell\.input-collapsed #map-input-overlay/);
  assert.doesNotMatch(pageSource, /\.map-command-shell\.input-collapsed \.map-floating-panel/);
  assert.match(pageSource, /let isGeoInputOpen = true;/);
  assert.match(pageSource, /shell\.classList\.toggle\('input-collapsed', !isGeoInputOpen\)/);
});

test("NLP engine keeps its own collapse state and reflows independently", () => {
  assert.match(nlpWidgetSource, /const \[isNlpEngineOpen, setIsNlpEngineOpen\] = useState\(false\)/);
  assert.match(nlpWidgetSource, /onClick=\{\(\) => setIsNlpEngineOpen\(\(current\) => !current\)\}/);
  assert.match(nlpWidgetSource, /const isGeoInputOpen = !shell\.classList\.contains\("input-collapsed"\)/);
  assert.match(nlpWidgetSource, /collapseObserver\.observe\(shell, \{ attributes: true, attributeFilter: \["class"\] \}\)/);
  assert.match(nlpWidgetSource, /isMobileLayout \|\| !isGeoInputOpen/);
});
