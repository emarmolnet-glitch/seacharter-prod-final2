import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function setup({ download, decode } = {}) {
  const stats = { starts: 0, stops: 0, closes: 0, disconnects: 0 };
  const context = vm.createContext({
    console,
    fetch: async () => {
      if (download) await download.promise;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    },
    window: { AudioContext: class {
      async decodeAudioData() { if (decode) await decode.promise; return {}; }
      async close() { stats.closes++; }
      createBufferSource() {
        return {
          connect() {}, disconnect() { stats.disconnects++; },
          start() { stats.starts++; }, stop() { stats.stops++; this.onended?.(); },
        };
      }
    } },
  });
  vm.runInContext(`
    const useRef = current => ({current});
    const isOpen = true, isMadreOpen = true, controlledIsMuted = undefined;
    let internalIsMuted = false;
    const setInternalIsMuted = value => { internalIsMuted = value; };
    const onMuteToggle = undefined;
    ${between('async function playNeuralMotherVoice(', '\n/**')}
    ${between('  const currentAudioRef =', '\n  useEffect')}
    ${between('  const speakText =', '  const handleReset =')}
    globalThis.api = { speakText, toggleMute, stopCurrentAudio, currentAudioRef, voiceStateRef };
  `, context);
  return { ...context.api, stats };
}

test('mute during TTS download prevents playback, even after unmuting', async () => {
  const download = deferred();
  const api = setup({ download });
  const pending = api.speakText('respuesta');
  api.toggleMute();
  api.toggleMute();
  download.resolve();
  await pending;
  assert.equal(api.stats.starts, 0);
  assert.equal(api.stats.closes, 1);
  assert.equal(api.currentAudioRef.current, null);
});

test('mute during decoding discards the prepared audio', async () => {
  const decode = deferred();
  const api = setup({ decode });
  const pending = api.speakText('respuesta');
  await new Promise(resolve => setImmediate(resolve));
  api.toggleMute();
  decode.resolve();
  await pending;
  assert.equal(api.stats.starts, 0);
  assert.equal(api.stats.closes, 1);
});

test('mute synchronously stops and clears active audio; fresh voice can play after unmute', async () => {
  const api = setup();
  await api.speakText('primera');
  assert.equal(api.stats.starts, 1);
  api.toggleMute();
  assert.equal(api.stats.stops, 1);
  assert.equal(api.currentAudioRef.current, null);
  await api.speakText('silenciada');
  assert.equal(api.stats.starts, 1);
  api.toggleMute();
  await api.speakText('nueva');
  assert.equal(api.stats.starts, 2);
});

test('closing or invalidating playback discards pending audio', async () => {
  const download = deferred();
  const api = setup({ download });
  const pending = api.speakText('respuesta');
  api.voiceStateRef.current.open = false;
  api.stopCurrentAudio();
  download.resolve();
  await pending;
  assert.equal(api.stats.starts, 0);
  assert.equal(api.currentAudioRef.current, null);
});

test('overlapping requests only start the newest source', async () => {
  const download = deferred();
  const api = setup({ download });
  const first = api.speakText('anterior');
  const second = api.speakText('actual');
  download.resolve();
  await Promise.all([first, second]);
  assert.equal(api.stats.starts, 1);
  assert.equal(api.stats.closes, 1);
});

// Guard the native touch-to-click path: controls must be excluded before drag starts.
test('header controls are excluded from drag initiation and close uses audio cleanup', () => {
  assert.match(source, /<Draggable[^>]*cancel="button, \.madre-header-controls"/);
  assert.match(source, /className="madre-header-controls /);
  assert.match(source, /onClick=\{handleClose\}/);
  assert.doesNotMatch(source, /<audio ref=\{currentAudioRef\}/);
});
