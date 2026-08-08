import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAisDestination } from '../src/tracking-destination.mjs';

test('tracking resolves the AIS UN/LOCODE ESVLC to Valencia', () => {
  assert.deepEqual(normalizeAisDestination('ESVLC'), {
    raw: 'ESVLC',
    name: 'Valencia (ES)',
    locode: 'ESVLC',
    isLocode: true,
    searchQuery: 'Valencia (ES)',
  });
});

test('tracking preserves a textual AIS destination as the POD query', () => {
  assert.deepEqual(normalizeAisDestination('DEST: Port Said'), {
    raw: 'Port Said',
    name: 'Port Said',
    locode: null,
    isLocode: false,
    searchQuery: 'Port Said',
  });
});

test('tracking recognizes separated UN/LOCODE input', () => {
  assert.equal(normalizeAisDestination('ES VLC')?.locode, 'ESVLC');
});
