import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('index.html defines highlightCarteraMatchesInUI and applyCarteraMatchHighlight', () => {
  assert.match(indexSource, /function highlightCarteraMatchesInUI\(carteraMatches\)/);
  assert.match(indexSource, /function applyCarteraMatchHighlight\(card\)/);
  assert.match(indexSource, /EN CARTERA - LISTO PARA CÁLCULO/);
});

test('postDataBridgeReceiveVessels intercepts carteraMatches and invokes UI highlight', () => {
  assert.match(indexSource, /const carteraMatches = responsePayload\?\.carteraMatches \|\| responsePayload\?\.cartera_matches;/);
  assert.match(indexSource, /highlightCarteraMatchesInUI\(carteraMatches\);/);
});

test('highlightCarteraMatchesInUI highlights matching vessel cards and injects badge without breaking action buttons', () => {
  class MockElement {
    constructor(tagName, className = '', id = '') {
      this.tagName = tagName.toUpperCase();
      this.className = className;
      this.id = id;
      const classSet = new Set(className.split(' ').filter(Boolean));
      this.classList = {
        _set: classSet,
        add: (...cls) => cls.forEach(c => classSet.add(c)),
        remove: (...cls) => cls.forEach(c => classSet.delete(c)),
        contains: (c) => classSet.has(c),
        toString: () => Array.from(classSet).join(' ')
      };
      this.attributes = new Map();
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.textContent = '';
      this.innerHTML = '';
    }

    setAttribute(key, value) {
      this.attributes.set(key, String(value));
      if (key.startsWith('data-')) {
        const camelKey = key.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        this.dataset[camelKey] = String(value);
      }
    }

    getAttribute(key) {
      return this.attributes.get(key) || null;
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    insertBefore(newNode, referenceNode) {
      newNode.parentNode = this;
      const index = this.children.indexOf(referenceNode);
      if (index >= 0) {
        this.children.splice(index, 0, newNode);
      } else {
        this.children.push(newNode);
      }
      return newNode;
    }

    querySelector(selector) {
      if (selector.includes('.absolute.top-4') || selector.includes('.top-4')) {
        return this.children.find(c => c.classList?.contains('absolute')) || null;
      }
      if (selector.includes('.matching-audit-select')) {
        return this.children.find(c => c.getAttribute('data-audit-key')) || null;
      }
      if (selector.includes('.flex.items-start')) {
        return this.children.find(c => c.classList?.contains('flex')) || null;
      }
      return null;
    }

    querySelectorAll(selector) {
      return this.children.filter(c => c.getAttribute('data-matching-result-card') === 'true');
    }
  }

  // Create simulated cards
  const matchingContainer = new MockElement('div', 'space-y-4', 'matching-results-list');
  
  const cardMatched = new MockElement('div', 'matching-vessel-card border border-slate-200 rounded-xl p-5');
  cardMatched.setAttribute('data-matching-result-card', 'true');
  cardMatched.setAttribute('data-vessel-imo', '9876543');

  const rankRibbon = new MockElement('div', 'absolute top-4 right-5 flex items-center gap-2');
  const actionButton = new MockElement('button', 'w-full bg-slate-900 text-white');
  actionButton.textContent = 'Aplicar a Estimador';
  cardMatched.appendChild(rankRibbon);
  cardMatched.appendChild(actionButton);

  const cardUnmatched = new MockElement('div', 'matching-vessel-card border border-slate-200 rounded-xl p-5');
  cardUnmatched.setAttribute('data-matching-result-card', 'true');
  cardUnmatched.setAttribute('data-vessel-imo', '1111111');

  matchingContainer.children.push(cardMatched, cardUnmatched);

  const mockDocument = {
    querySelectorAll: (selector) => {
      if (selector.includes('#matching-results-list')) {
        return [cardMatched, cardUnmatched];
      }
      return [];
    },
    querySelector: (selector) => {
      if (selector === '#matching-results-list') return matchingContainer;
      return null;
    },
    createElement: (tagName) => new MockElement(tagName)
  };

  const context = vm.createContext({
    document: mockDocument,
    window: { __lastCarteraMatches: null },
    console
  });

  const extractStart = indexSource.indexOf('function highlightCarteraMatchesInUI(carteraMatches)');
  const extractEnd = indexSource.indexOf('const DATA_BRIDGE_RECEIVE_CORE_DATA_URL =');
  const codeToRun = indexSource.slice(extractStart, extractEnd);

  vm.runInContext(codeToRun, context);

  // Execute highlight with carteraMatches containing 9876543
  context.highlightCarteraMatchesInUI([
    { imo: '9876543', vessel_name: 'CARTERA VESSEL' }
  ]);

  // Verify matched card has been highlighted
  assert.equal(cardMatched.dataset.carteraMatched, 'true');
  assert.ok(cardMatched.classList.contains('border-emerald-500'));
  assert.ok(cardMatched.classList.contains('bg-emerald-50/40'));

  // Verify badge injection in ribbon
  const injectedBadge = rankRibbon.children[0];
  assert.ok(injectedBadge);
  assert.match(injectedBadge.innerHTML, /EN CARTERA - LISTO PARA CÁLCULO/);

  // Verify action button is preserved untouched
  assert.equal(cardMatched.children[cardMatched.children.length - 1], actionButton);
  assert.equal(actionButton.textContent, 'Aplicar a Estimador');

  // Verify unmatched card was not highlighted
  assert.equal(cardUnmatched.dataset.carteraMatched, undefined);
  assert.ok(!cardUnmatched.classList.contains('border-emerald-500'));
});
