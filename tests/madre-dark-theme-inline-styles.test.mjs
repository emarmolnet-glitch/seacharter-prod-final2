import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. GlobalMadreDrawer Header contains approved floating light styling and Cerebro Central badge', () => {
  // Check aside element with light styling and floating bottom-right positioning
  assert.match(
    globalMadreDrawerSource,
    /fixed bottom-4 right-4 z-\[(?:60|9999)\] w-\[450px\] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col text-gray-800 overflow-hidden/,
    'Aside must be positioned as a floating widget on the bottom-right with light styling'
  );

  // Check title span
  assert.match(
    globalMadreDrawerSource,
    /<span className="font-bold text-(?:sm tracking-wide truncate text-(?:slate|gray)-800|base text-white|sm text-gray-800 tracking-wide truncate|sm text-gray-800)">MADRE<\/span>/,
    'Title span MADRE must exist with text-gray-800'
  );

  // Check Cerebro Central reference in module or header
  assert.match(
    globalMadreDrawerSource,
    /Cerebro Central/,
    'Header or component must have Cerebro Central reference'
  );
});

test('2. GlobalMadreDrawer Action Buttons have audio mute, scan, and close handlers', () => {
  // Check Drag Handle header classes
  assert.match(
    globalMadreDrawerSource,
    /className="drag-handle cursor-move bg-white border-b border-gray-100 p-[23] flex justify-between items-center/,
    'Header must be a drag handle with approved light classes'
  );

  // Check Scan button inside header
  assert.match(
    globalMadreDrawerSource,
    /id="btn-madre-scan-screen"/,
    'Scan button must exist'
  );

  // Check Close and Mute buttons
  assert.match(
    globalMadreDrawerSource,
    /<button[\s\S]*?onClick=\{(?:toggleMute|handleMuteToggle)\}[\s\S]*?>[\s\S]*?\{isMuted \? ["']🔇["'] : ["']🔊["']\}[\s\S]*?<\/button>/,
    'Mute button must exist'
  );

  assert.match(
    globalMadreDrawerSource,
    /<button[\s\S]*?onClick=\{[\s\S]*?(?:handleClose|setIsMadreOpen\(false\))[\s\S]*?\}[\s\S]*?>[\s\S]*?✕[\s\S]*?<\/button>/,
    'Close button must exist'
  );
});

test('3. GlobalMadreDrawer contains full API fetch logic, chat UI, loading indicator, and auto-scroll', () => {
  // Check endpoint constant
  assert.match(
    globalMadreDrawerSource,
    /export const MADRE_API_ENDPOINT = "https:\/\/(?:calm-shortbread-55bcfc\.netlify\.app\/\.netlify\/functions|neon-seachartercorepro-4ce09d\.netlify\.app\/api)\/madre-chat"/,
    'Must define MADRE_API_ENDPOINT'
  );

  // Check fetch to madre-chat endpoint
  assert.match(
    globalMadreDrawerSource,
    /fetch\(MADRE_API_ENDPOINT/,
    'Must include fetch call to MADRE_API_ENDPOINT'
  );

  // Check handleSubmit
  assert.match(
    globalMadreDrawerSource,
    /const handleSubmit = async/,
    'Must define handleSubmit logic'
  );

  // Check loading indicator
  assert.match(
    globalMadreDrawerSource,
    /isLoading/,
    'Must handle isLoading state'
  );

  // Check auto-scroll with messagesEndRef
  assert.match(
    globalMadreDrawerSource,
    /messagesEndRef\.current(?:\?)?\.scrollIntoView/,
    'Must implement auto-scroll using messagesEndRef'
  );

  // Check global window bridge exposure
  assert.match(
    globalMadreDrawerSource,
    /window\.openMadreDrawer = handleOpen/,
    'Must expose openMadreDrawer on window'
  );
  assert.match(
    globalMadreDrawerSource,
    /window\.closeMadreDrawer = handleCloseEvent/,
    'Must expose closeMadreDrawer on window'
  );
  assert.match(
    globalMadreDrawerSource,
    /window\.toggleMadreDrawer = handleToggle/,
    'Must expose toggleMadreDrawer on window'
  );
});

test('4. App.jsx TopNav trigger button has toggle handler, explicit sizing and styles for MADRE image', () => {
  // Check trigger button tag with onClick toggle
  assert.match(
    appSource,
    /<button[\s\S]*?id="btn-madre-trigger"[\s\S]*?onClick=\{\(\) => setIsMadreOpen\(!isMadreOpen\)\}/,
    'Trigger button must toggle isMadreOpen state on click'
  );

  // Check accessibility attributes
  assert.match(appSource, /title="Abrir Asistente Estratégico MADRE"/);
  assert.match(appSource, /aria-label="Abrir asistente MADRE"/);

  // Check exact img tag inside trigger button
  assert.match(
    appSource,
    /<img src="\/MADRE\.png" alt="MADRE" className="w-5 h-5 rounded-full object-cover animate-pulse shadow-\[0_0_8px_rgba\(45,212,191,0\.8\)\]" style=\{\{ width: '20px', height: '20px', borderRadius: '50%' \}\} \/>/,
    'img tag for MADRE.png must have explicit sizing classes and inline styles'
  );

  // Check span text
  assert.match(
    appSource,
    /<span style=\{\{ color: '#5eead4' \}\}>MADRE<\/span>/,
    'span tag for MADRE must have color: #5eead4'
  );
});

test('5. Assets check: public/MADRE.png exists', () => {
  assert.ok(existsSync(new URL('../public/MADRE.png', import.meta.url)), 'public/MADRE.png must exist');
});

test('6. index.html contains approved madre-topbar-button trigger', () => {
  const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(
    indexHtmlSource,
    /<button[\s\S]*?id="madre-topbar-button"[\s\S]*?class="madre-topbar-btn relative flex items-center justify-center w-10 h-10 rounded-full p-0 bg-transparent border-0 cursor-pointer focus:outline-none mr-2"/,
    'index.html must have madre-topbar-button with approved attributes'
  );
  assert.match(
    indexHtmlSource,
    /<div[\s\S]*?id="madre-topbar-glow"[\s\S]*?class="madre-topbar-glow absolute inset-0 rounded-full animate-pulse bg-cyan-500 blur-md pointer-events-none opacity-80"/,
    'index.html must contain madre-topbar-glow'
  );
  assert.match(
    indexHtmlSource,
    /<img[\s\S]*?id="madre-topbar-img"[\s\S]*?src="\/MADRE\.png"[\s\S]*?alt="MADRE"/,
    'index.html must contain madre-topbar-img with src="/MADRE.png"'
  );
  assert.match(
    indexHtmlSource,
    /onclick="if\(window\.toggleMadreDrawer\) window\.toggleMadreDrawer\(\); else window\.dispatchEvent\(new CustomEvent\('madre:toggle'\)\);"/,
    'index.html must contain correct toggle event onclick'
  );
});

test('7. madre-drawer-entry.jsx exists, mounts GlobalMadreDrawer, and is linked in index.html', () => {
  const entryPath = new URL('../src/madre-drawer-entry.jsx', import.meta.url);
  assert.ok(existsSync(entryPath), 'src/madre-drawer-entry.jsx must exist');

  const entrySource = readFileSync(entryPath, 'utf8');
  assert.match(entrySource, /import\s+React\s+from\s+['"]react['"]/);
  assert.match(entrySource, /import\s+\{\s*createRoot\s*\}\s+from\s+['"]react-dom\/client['"]/);
  assert.match(entrySource, /import\s+\{\s*GlobalMadreDrawer\s*\}\s+from\s+['"]\.\/components\/GlobalMadreDrawer['"]/);
  assert.match(entrySource, /global-madre-drawer-root/);
  assert.match(entrySource, /createRoot\(container\)\.render\(<GlobalMadreDrawer\s*\/>\)/);
  assert.match(entrySource, /DOMContentLoaded/);

  const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(
    indexHtmlSource,
    /<script\s+type="module"\s+src="\.\/src\/madre-drawer-entry\.jsx"><\/script>/,
    'index.html must import ./src/madre-drawer-entry.jsx'
  );
});

test('8. Floating Widget: Draggable wrapper, conditional rendering, and clean header action buttons', () => {
  // react-draggable import and Draggable wrapping
  assert.match(globalMadreDrawerSource, /import Draggable from 'react-draggable';/);
  assert.match(globalMadreDrawerSource, /<Draggable[^>]*handle="\.drag-handle"/);

  // Returns null when closed
  assert.match(globalMadreDrawerSource, /if\s*\(!isMadreOpen\)\s*return\s*null;/);

  // Header action buttons styling
  assert.match(
    globalMadreDrawerSource,
    /text-gray-600 hover:bg-gray-100/,
    'Action buttons must have text-gray-600 hover:bg-gray-100'
  );
  assert.match(
    globalMadreDrawerSource,
    /<button[\s\S]*?onClick=\{toggleMute\}[\s\S]*?title=\{isMuted \? ["']Activar voz["'] : ["']Silenciar voz["']\}[\s\S]*?>[\s\S]*?\{isMuted \? ["']🔇["'] : ["']🔊["']\}[\s\S]*?<\/button>/,
    'Mute button must use toggleMute and light styling'
  );
  assert.match(
    globalMadreDrawerSource,
    /<button[\s\S]*?onClick=\{\(\) => setIsMadreOpen\(false\)\}[\s\S]*?title="Cerrar"[\s\S]*?>[\s\S]*?✕[\s\S]*?<\/button>/,
    'Close button must have light styling and title'
  );

  // Audio tag check
  assert.match(
    globalMadreDrawerSource,
    /<audio ref=\{currentAudioRef\} className="hidden" aria-hidden="true" \/>/,
    'Audio tag must exist before aside closes'
  );
});

test('9. Width & Floating Dimensions: w-[450px] shadow-2xl rounded-xl with non-overlapping header', () => {
  assert.match(
    globalMadreDrawerSource,
    /w-\[450px\]/,
    'Aside must contain w-[450px]'
  );
  assert.match(
    globalMadreDrawerSource,
    /shadow-2xl/,
    'Aside must contain shadow-2xl'
  );
  assert.match(
    globalMadreDrawerSource,
    /rounded-xl/,
    'Aside must contain rounded-xl'
  );

  // Strict flexbox header with min-w-0 and truncate
  assert.match(
    globalMadreDrawerSource,
    /<header[\s\S]*?className="drag-handle cursor-move bg-white border-b border-gray-100 p-[23] flex justify-between items-center/,
    'Header must use drag-handle flexbox layout'
  );
});

test('10. Light Theme Parity: Chat bubbles, input and styling', () => {
  // Chat body
  assert.match(
    globalMadreDrawerSource,
    /overflow-y-auto max-h-\[60vh\](?: min-h-\[300px\])? bg-gray-50 p-4/,
    'Chat body must use overflow-y-auto max-h-[60vh] bg-gray-50 p-4'
  );

  // MADRE light chat bubbles
  assert.match(
    globalMadreDrawerSource,
    /bg-white border border-gray-200 text-gray-800/,
    'MADRE assistant chat bubble must use bg-white border border-gray-200 text-gray-800'
  );

  // User light chat bubbles
  assert.match(
    globalMadreDrawerSource,
    /bg-blue-50 border border-blue-100 text-gray-800/,
    'User chat bubble must use light styling with text-gray-800'
  );

  // Input styling
  assert.match(
    globalMadreDrawerSource,
    /bg-white border-t border-gray-100 p-3/,
    'Footer container must use bg-white border-t border-gray-100 p-3'
  );
  assert.match(
    globalMadreDrawerSource,
    /bg-white border border-gray-200 text-gray-800 placeholder-gray-400 rounded-lg p-2 w-full/,
    'Text input must have light styling'
  );

  // Submit button styling
  assert.match(
    globalMadreDrawerSource,
    /bg-teal-700 hover:bg-teal-600 text-white/,
    'Submit button must have teal styling'
  );
});
