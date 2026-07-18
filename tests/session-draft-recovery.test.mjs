import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const sessionDraftSource = await readFile(new URL('../session-draft.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function createStorage(initialValues = {}) {
    const values = new Map(Object.entries(initialValues));
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        },
    };
}

function createDocument() {
    const elements = new Map();
    const prepended = [];

    class FakeElement {
        constructor() {
            this.listeners = new Map();
            this.attributes = new Map();
            this.buttons = {
                restore: new FakeButton(),
                discard: new FakeButton(),
            };
            this.isRemoved = false;
        }

        set id(value) {
            this._id = value;
            elements.set(value, this);
        }

        get id() {
            return this._id;
        }

        setAttribute(name, value) {
            this.attributes.set(name, value);
        }

        querySelector(selector) {
            if (selector.includes('restore')) return this.buttons.restore;
            if (selector.includes('discard')) return this.buttons.discard;
            return null;
        }

        remove() {
            this.isRemoved = true;
            elements.delete(this.id);
        }
    }

    class FakeButton {
        addEventListener(type, listener) {
            this.listener = type === 'click' ? listener : this.listener;
        }

        click() {
            this.listener?.();
        }
    }

    return {
        readyState: 'complete',
        body: {
            prepend(element) {
                prepended.push(element);
            },
        },
        createElement() {
            return new FakeElement();
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        get banner() {
            return prepended.at(-1);
        },
    };
}

function loadSessionDraftApi({ storage, documentRef, timers }) {
    const window = {
        localStorage: storage,
        document: documentRef,
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
    };
    vm.runInNewContext(sessionDraftSource, { window, console, Date });
    return window.SeaCharterSessionDraft;
}

function createStore(initialState) {
    const listeners = new Set();
    let state = { ...initialState };
    return {
        getState: () => state,
        set(partial) {
            state = { ...state, ...partial };
            listeners.forEach((listener) => listener(state));
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

function createTimers() {
    const pending = new Map();
    let nextId = 1;
    return {
        setTimeout(callback, delay) {
            const id = nextId++;
            pending.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) {
            pending.delete(id);
        },
        runLatest() {
            const [id, timer] = [...pending.entries()].at(-1);
            pending.delete(id);
            timer.callback();
            return timer.delay;
        },
    };
}

test('passive session saving mirrors selected Store state after 1500ms', () => {
    const storage = createStorage();
    const documentRef = createDocument();
    const timers = createTimers();
    const api = loadSessionDraftApi({ storage, documentRef, timers });
    const store = createStore({ pol: 'Skikda', pod: 'Monopoli', cargo: 30000 });

    api.initialize({ store, storage, documentRef, setTimeoutFn: timers.setTimeout, clearTimeoutFn: timers.clearTimeout });
    store.set({
        pol: 'Cartagena',
        dualPrecioFOB: '80',
        dualPrecioCIF: '112',
        dualMargenBruto: 32,
        dualMargenNeto: 7.5,
    });

    assert.equal(storage.getItem(api.key), null);
    assert.equal(timers.runLatest(), 1500);

    const savedDraft = JSON.parse(storage.getItem(api.key));
    assert.equal(savedDraft.state.pol, 'Cartagena');
    assert.equal(savedDraft.state.pod, 'Monopoli');
    assert.equal(savedDraft.state.dualPrecioFOB, '80');
    assert.equal(savedDraft.state.dualMargenNeto, 7.5);
    assert.equal(Object.hasOwn(savedDraft.state, 'cargo'), false);
    assert.equal(Object.hasOwn(savedDraft.state, 'stowageFactor'), false);
    assert.equal(Object.hasOwn(savedDraft.state, 'cargoTolerance'), false);
});

test('boot check shows recovery UI and restores the exact stored snapshot on confirmation', () => {
    const storedState = {
        portBallast: 'Valencia',
        pol: 'Skikda',
        pod: 'Monopoli',
        distBallast: 220,
        distLaden: 760,
        totalMiles: 980,
        sugOwner: 24.5,
        dualPrecioFOB: '80',
        dualPrecioCIF: '112',
        dualMargenBruto: 32,
        dualMargenNeto: 7.5,
    };
    const storage = createStorage({
        seacharter_session_draft: JSON.stringify({ version: 1, savedAt: '2026-07-18T00:00:00.000Z', state: storedState }),
    });
    const documentRef = createDocument();
    const timers = createTimers();
    const api = loadSessionDraftApi({ storage, documentRef, timers });
    const store = createStore({});
    let hydratedState = null;

    const controller = api.initialize({
        store,
        storage,
        documentRef,
        hydrate: (state) => { hydratedState = state; },
        setTimeoutFn: timers.setTimeout,
        clearTimeoutFn: timers.clearTimeout,
    });

    assert.equal(controller.hasUnsavedSession(), true);
    assert.match(documentRef.banner.innerHTML, /Se ha detectado una estimación anterior sin guardar/);

    documentRef.banner.buttons.restore.click();

    assert.deepEqual({ ...hydratedState }, storedState);
    assert.equal(controller.hasUnsavedSession(), false);
    assert.equal(documentRef.banner.isRemoved, true);
});

test('discard removes the local draft and hides the recovery banner', () => {
    const storage = createStorage({
        seacharter_session_draft: JSON.stringify({ version: 1, state: { pol: 'Skikda' } }),
    });
    const documentRef = createDocument();
    const timers = createTimers();
    const api = loadSessionDraftApi({ storage, documentRef, timers });
    const controller = api.initialize({
        store: createStore({}),
        storage,
        documentRef,
        setTimeoutFn: timers.setTimeout,
        clearTimeoutFn: timers.clearTimeout,
    });

    documentRef.banner.buttons.discard.click();

    assert.equal(storage.getItem(api.key), null);
    assert.equal(controller.hasUnsavedSession(), false);
    assert.equal(documentRef.banner.isRemoved, true);
});

test('hydration remains outside calculator formulas and protected input flow', () => {
    assert.match(indexSource, /hydrate:\s*\(sessionState\)\s*=>\s*\{\s*SeaCharterStore\.set\(sessionState\);\s*syncGlobalStateToForms\(\);/s);
    assert.doesNotMatch(indexSource, /hydrate:[\s\S]{0,180}runEngine\(/);
    assert.doesNotMatch(sessionDraftSource, /'cargo'|'stowageFactor'|'cargoTolerance'/);
    assert.match(indexSource, /id="cargo-tolerance"[^>]*oninput="runEngine\(\)"/);
});
