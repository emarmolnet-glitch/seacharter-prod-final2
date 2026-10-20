import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. GlobalMadreDrawer Header contains approved dark styling and Cerebro Central badge', () => {
  // Check aside element with dark styling and left-side slide positioning
  assert.match(
    globalMadreDrawerSource,
    /<aside[^>]*className="[^"]*fixed top-0 left-0 bottom-0[^"]*"/,
    'Aside must be positioned on the left side'
  );
  assert.match(
    globalMadreDrawerSource,
    /<aside[^>]*style=\{\{\s*backgroundColor:\s*'#0f172a'/,
    'Aside must force dark background #0f172a'
  );

  // Check title span
  assert.match(
    globalMadreDrawerSource,
    /<span className="font-bold text-(?:sm tracking-wide truncate text-slate-800|base text-white)">MADRE<\/span>/,
    'Title span MADRE must exist'
  );

  // Check Cerebro Central badge
  assert.match(
    globalMadreDrawerSource,
    /Cerebro Central/,
    'Header must have Cerebro Central badge'
  );
});

test('2. GlobalMadreDrawer Action Buttons have audio mute, reset, and close handlers', () => {
  // Check Close, Mute, and Reset buttons
  assert.match(
    globalMadreDrawerSource,
    /<button[^>]*onClick=\{(?:toggleMute|handleMuteToggle)\}[^>]*>\{isMuted \? '🔇' : '🔊'\}<\/button>/,
    'Mute button must exist'
  );

  assert.match(
    globalMadreDrawerSource,
    /<button[^>]*onClick=\{handleReset\}[^>]*>🔄<\/button>/,
    'Reset button must exist'
  );

  assert.match(
    globalMadreDrawerSource,
    /<button[^>]*onClick=\{handleClose\}[^>]*>✕<\/button>/,
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

test('4. App.jsx TopNav trigger button has dark inline styles, explicit sizing and styles for MADRE image', () => {
  // Check exact trigger button tag
  assert.match(
    appSource,
    /<button[\s\S]*?id="btn-madre-trigger"[\s\S]*?className="inline-flex items-center gap-2 px-3 py-1\.5 rounded-lg shadow-sm transition-all cursor-pointer font-sans text-xs font-bold"[\s\S]*?style=\{\{ backgroundColor: '#0f172a', color: '#5eead4', border: '1px solid rgba\(45,212,191,0\.4\)' \}\}/,
    'Trigger button must match exact attributes and inline style override'
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

test('8. Final Polish: MADRE Drawer left-side slide positioning and clean header action buttons', () => {
  // Left-side slide positioning classes and styling
  assert.match(
    globalMadreDrawerSource,
    /className="fixed top-0 left-0 bottom-0 z-\[9999\] w-\[420px\] max-w-lg bg-slate-900 text-slate-100 shadow-2xl border-r border-slate-800 flex flex-col font-sans transition-all duration-300"/,
    'Aside must have left-side slide positioning with border-r and transition'
  );
  assert.match(
    globalMadreDrawerSource,
    /style=\{\{ backgroundColor: '#0f172a', color: '#ffffff' \}\}/,
    'Aside must have dark backgroundColor and white color'
  );

  // Clean uncrowded header and buttons
  assert.match(
    globalMadreDrawerSource,
    /className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-white"/,
    'Header must have shrink-0 to prevent button crowding'
  );
  assert.match(
    globalMadreDrawerSource,
    /className="flex items-center gap-2 shrink-0"/,
    'Header button container must have shrink-0 and clean gap'
  );
  assert.match(
    globalMadreDrawerSource,
    /<button type="button" onClick=\{toggleMute\} className="p-1\.5 rounded hover:bg-slate-100 text-slate-500 transition-colors flex items-center justify-center min-w-\[28px\]" title=\{isMuted \? 'Activar voz' : 'Silenciar voz'\}>\{isMuted \? '🔇' : '🔊'\}<\/button>/,
    'Mute button must use toggleMute and clean styling'
  );
  assert.match(
    globalMadreDrawerSource,
    /<button type="button" onClick=\{handleReset\} className="p-1\.5 rounded hover:bg-slate-100 text-slate-500 transition-colors flex items-center justify-center min-w-\[28px\]" title="Reiniciar conversación">🔄<\/button>/,
    'Reset button must have clean styling and title'
  );
  assert.match(
    globalMadreDrawerSource,
    /<button type="button" onClick=\{handleClose\} className="p-1\.5 rounded hover:bg-slate-100 text-slate-500 transition-colors flex items-center justify-center min-w-\[28px\]" title="Cerrar panel">✕<\/button>/,
    'Close button must have clean styling and title'
  );
});

test('9. Widen Drawer & Flexbox Header Layout: w-[420px] max-w-lg with non-overlapping buttons', () => {
  // Widen drawer class
  assert.match(
    globalMadreDrawerSource,
    /<aside[^>]*w-\[420px\]/,
    'Aside must contain w-[420px] for a wider drawer'
  );
  assert.match(
    globalMadreDrawerSource,
    /<aside[^>]*max-w-lg/,
    'Aside must contain max-w-lg'
  );

  // Strict flexbox header with min-w-0 and truncate
  assert.match(
    globalMadreDrawerSource,
    /<header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-white">/,
    'Header must use strict flexbox layout'
  );
  assert.match(
    globalMadreDrawerSource,
    /<div className="flex items-center gap-2 min-w-0">/,
    'Left side of header must include min-w-0 to prevent overflow'
  );
  assert.match(
    globalMadreDrawerSource,
    /<span className="font-bold text-sm tracking-wide truncate text-slate-800">MADRE<\/span>/,
    'MADRE title must have truncate and text-slate-800'
  );
  assert.match(
    globalMadreDrawerSource,
    /<div className="flex items-center gap-2 shrink-0">/,
    'Right side action buttons container must have shrink-0 and gap-2'
  );
  assert.match(
    globalMadreDrawerSource,
    /p-1\.5 rounded hover:bg-slate-100 text-slate-500 transition-colors flex items-center justify-center min-w-\[28px\]/,
    'Action buttons must have p-1.5, min-w-[28px], and clean hover transitions'
  );
});
