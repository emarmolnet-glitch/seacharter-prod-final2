import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexPath = new URL('../index.html', import.meta.url);
const distIndexPath = new URL('../dist/index.html', import.meta.url);
const contractRefPath = new URL('../contract-reference.js', import.meta.url);

const indexHtml = readFileSync(indexPath, 'utf8');
const distIndexHtml = readFileSync(distIndexPath, 'utf8');
const contractRefJs = readFileSync(contractRefPath, 'utf8');

test('App Switcher Menu: duplicate "Data Bridge Link" is removed from index.html and dist/index.html', () => {
  for (const [file, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const menuMatch = content.match(/<ul id="tools-dropdown-menu"[\s\S]*?<\/ul>/);
    assert.ok(menuMatch, `tools-dropdown-menu must exist in ${file}`);
    const menuContent = menuMatch[0];

    assert.doesNotMatch(
      menuContent,
      /Data Bridge Link/,
      `"Data Bridge Link" duplicate must not exist in ${file} menu`,
    );
    assert.doesNotMatch(
      menuContent,
      /id="btn-open-databridge-direct"/,
      `Duplicate direct button must not exist in ${file} menu`,
    );
  }
});

test('App Switcher Menu: Data Bridge link inherits session ID dynamically with target="_blank"', () => {
  for (const [file, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const menuMatch = content.match(/<ul id="tools-dropdown-menu"[\s\S]*?<\/ul>/);
    assert.ok(menuMatch, `tools-dropdown-menu must exist in ${file}`);
    const menuContent = menuMatch[0];

    assert.match(
      menuContent,
      /id="btn-toggle-databridge"/,
      `Data Bridge link must exist in ${file} menu`,
    );
    assert.match(
      menuContent,
      /href="https:\/\/calm-shortbread-55bcfc\.netlify\.app\/"/,
      `Data Bridge base URL must be present in ${file} menu`,
    );
    assert.match(
      menuContent,
      /id="btn-toggle-databridge"[^>]*target="_blank"/,
      `Data Bridge link must have target="_blank" in ${file}`,
    );
    assert.match(
      menuContent,
      /<span>Data Bridge<\/span>/,
      `Data Bridge text must match native menu style in ${file}`,
    );
  }
});

test('App Switcher Menu: Land Charter Core PRO option is present with target="_blank"', () => {
  for (const [file, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const menuMatch = content.match(/<ul id="tools-dropdown-menu"[\s\S]*?<\/ul>/);
    assert.ok(menuMatch, `tools-dropdown-menu must exist in ${file}`);
    const menuContent = menuMatch[0];

    assert.match(
      menuContent,
      /id="btn-open-land-charter"/,
      `Land Charter link must exist in ${file} menu`,
    );
    assert.match(
      menuContent,
      /href="https:\/\/landchartercorepro\.netlify\.app\/"/,
      `Land Charter base URL must be present in ${file} menu`,
    );
    assert.match(
      menuContent,
      /id="btn-open-land-charter"[^>]*target="_blank"/,
      `Land Charter link must have target="_blank" in ${file}`,
    );
    assert.match(
      menuContent,
      /<span>Land Charter Core PRO<\/span>/,
      `Land Charter Core PRO text must match native menu style in ${file}`,
    );
  }
});

test('Ecosystem URL builder concatenates ?ref= when reference is present and returns base URL when empty', () => {
  // Execute module in a sandbox
  const sandbox = {};
  const runner = new Function('window', 'globalThis', `${contractRefJs}; return window;`);
  const env = runner(sandbox, sandbox);

  const { buildEcosystemUrl } = env;
  assert.equal(typeof buildEcosystemUrl, 'function', 'buildEcosystemUrl must be exported');

  const dataBridgeBase = 'https://calm-shortbread-55bcfc.netlify.app/';
  const landCharterBase = 'https://landchartercorepro.netlify.app/';

  // 1. With active reference
  assert.equal(
    buildEcosystemUrl(dataBridgeBase, 'RDM/2026-0042'),
    'https://calm-shortbread-55bcfc.netlify.app/?ref=RDM/2026-0042',
  );
  assert.equal(
    buildEcosystemUrl(landCharterBase, 'RDM/2026-0042'),
    'https://landchartercorepro.netlify.app/?ref=RDM/2026-0042',
  );

  // 2. Empty reference returns base URL
  assert.equal(
    buildEcosystemUrl(dataBridgeBase, ''),
    'https://calm-shortbread-55bcfc.netlify.app/',
  );
  assert.equal(
    buildEcosystemUrl(landCharterBase, ''),
    'https://landchartercorepro.netlify.app/',
  );
  assert.equal(
    buildEcosystemUrl(landCharterBase, null),
    'https://landchartercorepro.netlify.app/',
  );
  assert.equal(
    buildEcosystemUrl(landCharterBase, '   '),
    'https://landchartercorepro.netlify.app/',
  );
});

test('extractCurrentVoyageReference extracts from ContractRefManager, DOM, URL or storage', () => {
  const fakeDomElement = { value: 'RDM/2026-8888' };
  const mockDocument = {
    getElementById(id) {
      if (id === 'contract-reference') return fakeDomElement;
      return null;
    },
    querySelector() { return null; },
  };

  const sandbox = {
    document: mockDocument,
    sessionStorage: {
      getItem(key) {
        if (key === 'active_contract_ref') return 'RDM/2026-7777';
        return null;
      },
    },
  };

  const runner = new Function('window', 'globalThis', `${contractRefJs}; return window;`);
  const env = runner(sandbox, sandbox);

  const { extractCurrentVoyageReference, handleEcosystemLinkClick } = env;
  assert.equal(typeof extractCurrentVoyageReference, 'function');
  assert.equal(typeof handleEcosystemLinkClick, 'function');

  const ref = extractCurrentVoyageReference();
  assert.ok(ref.startsWith('RDM/'), `Reference should start with RDM/, got ${ref}`);

  // Test click handler updating target element href
  const fakeElement = {
    href: 'https://landchartercorepro.netlify.app/',
    setAttribute(attr, val) {
      if (attr === 'href') this.href = val;
    },
  };
  handleEcosystemLinkClick({ currentTarget: fakeElement }, 'https://landchartercorepro.netlify.app/');
  assert.match(fakeElement.href, /https:\/\/landchartercorepro\.netlify\.app\/\?ref=RDM\//);
});
