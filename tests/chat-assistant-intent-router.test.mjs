import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CHAT_INTENTS,
  classifyChatIntent,
  hasOperationalSimulationUpdate,
  hasSimulationRouteAndVolume,
} from '../shared/chat-intent-router.mjs';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');

test('market and general questions never default to the freight wizard', () => {
  assert.equal(classifyChatIntent('¿Qué precio tiene hoy el VLSFO en Rotterdam?'), CHAT_INTENTS.MARKET_INFO);
  assert.equal(classifyChatIntent('¿Qué clima hay en Béjaïa y cómo afecta al laytime?'), CHAT_INTENTS.MARKET_INFO);
  assert.equal(classifyChatIntent('¿Dónde está el buque Ocean Star?'), CHAT_INTENTS.MARKET_INFO);
  assert.equal(classifyChatIntent('Explícame qué significa SHEX'), CHAT_INTENTS.GENERAL);
});

test('explicit freight simulations and active operational continuations are isolated', () => {
  assert.equal(
    classifyChatIntent('Simula un flete desde Valencia a Orán para 30.000 toneladas'),
    CHAT_INTENTS.SIMULATION,
  );
  assert.equal(hasSimulationRouteAndVolume('De Valencia a Orán, 30.000 MT'), true);
  assert.equal(
    classifyChatIntent('Carga 1500 y descarga 2000', {
      context: { draftVoyage: { POL: 'Valencia', POD: 'Orán' } },
    }),
    CHAT_INTENTS.SIMULATION,
  );
  assert.equal(
    hasOperationalSimulationUpdate('Carga 1500 y descarga 2000', {
      draftVoyage: { POL: 'Valencia', POD: 'Orán' },
    }),
    true,
  );
});

test('informational questions can interrupt an active simulation without consuming wizard fields', () => {
  assert.equal(
    classifyChatIntent('Antes, dime el clima en Orán', {
      conversationState: 'simulacion_flete_activa',
    }),
    CHAT_INTENTS.MARKET_INFO,
  );
});

test('frontend sends every message directly without local intent routing', () => {
  assert.doesNotMatch(frontendSource, /classifyChatIntent/);
  assert.doesNotMatch(frontendSource, /CHAT_INTENTS\.SIMULATION/);
  assert.doesNotMatch(frontendSource, /hasSimulationRouteAndVolume/);
  assert.doesNotMatch(frontendSource, /hasOperationalSimulationUpdate/);
  assert.doesNotMatch(frontendSource, /wizardStatus|wizardStep|nlpChecklistStep/);
  assert.match(frontendSource, /await requestAssistantResponse\(userText, history, controller\.signal\)/);
});

test('backend gates extraction actions and instructs the model not to demand calculator data', () => {
  assert.match(backendSource, /const intent = classifyChatIntent\(mensaje/);
  assert.match(backendSource, /intent === CHAT_INTENTS\.SIMULATION/);
  assert.match(backendSource, /Enrutador de Intenciones \(obligatorio y previo a cualquier extracción\)/);
  assert.match(backendSource, /terminantemente prohibido pedir variables de la calculadora/);
  assert.match(backendSource, /SOLO con intención SIMULACION_FLETE/);
  assert.match(backendSource, /return jsonResponse\(200, \{ success: true, intent, respuesta:/);
});
