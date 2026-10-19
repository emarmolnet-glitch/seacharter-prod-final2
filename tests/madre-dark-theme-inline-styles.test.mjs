import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. GlobalMadreDrawer Header contains forced dark theme inline styles', () => {
  // Check exact header element with inline styles
  assert.match(
    globalMadreDrawerSource,
    /<header className="madre-header flex items-center justify-between px-4 py-3 shrink-0" style=\{\{ backgroundColor: '#0f172a', color: '#ffffff', borderBottom: '1px solid #1e293b' \}\}>/,
    'Header must have exact class and inline style override'
  );

  // Check title span with forced white color
  assert.match(
    globalMadreDrawerSource,
    /<span className="font-bold text-base tracking-wide" style=\{\{ color: '#ffffff' \}\}>MADRE<\/span>/,
    'Title span MADRE must have font-bold text-base tracking-wide and style={{ color: "#ffffff" }}'
  );
});

test('2. GlobalMadreDrawer Action Buttons container and buttons have dark theme inline styles', () => {
  // Check parent div for action buttons
  assert.match(
    globalMadreDrawerSource,
    /<div className="flex items-center gap-3 ml-auto shrink-0" style=\{\{ color: '#ffffff' \}\}>/,
    'Action buttons parent div must have style={{ color: "#ffffff" }}'
  );

  // Check Close, Mute, and Reset buttons have forced transparent background and white color
  const muteBtnMatch = globalMadreDrawerSource.match(/<button[^>]*id="btn-madre-mute"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(muteBtnMatch, 'Mute button must exist');
  assert.match(muteBtnMatch[0], /style=\{\{ color: '#ffffff', backgroundColor: 'transparent' \}\}/);

  const resetBtnMatch = globalMadreDrawerSource.match(/<button[^>]*id="btn-madre-reset"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(resetBtnMatch, 'Reset button must exist');
  assert.match(resetBtnMatch[0], /style=\{\{ color: '#ffffff', backgroundColor: 'transparent' \}\}/);

  const closeBtnMatch = globalMadreDrawerSource.match(/<button[^>]*id="btn-madre-close"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(closeBtnMatch, 'Close button must exist');
  assert.match(closeBtnMatch[0], /style=\{\{ color: '#ffffff', backgroundColor: 'transparent' \}\}/);
});

test('3. GlobalMadreDrawer contains full API fetch logic, chat UI, loading indicator, and auto-scroll', () => {
  // Check fetch to madre-chat endpoint
  assert.match(
    globalMadreDrawerSource,
    /fetch\(\s*['"]https:\/\/neon-seachartercorepro-4ce09d\.netlify\.app\/api\/madre-chat['"]/,
    'Must include fetch call to https://neon-seachartercorepro-4ce09d.netlify.app/api/madre-chat'
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
