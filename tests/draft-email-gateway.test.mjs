import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const functionSource = await readFile(new URL('../netlify/functions/send-email.js', import.meta.url), 'utf8');
const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../assets/css/sea-assistant.css', import.meta.url), 'utf8');

// El fichero es ESM aunque use extensión .js (igual que chat-assistant.js), así que se importa como data URL.
const { default: sendEmail } = await import(
  `data:text/javascript;base64,${Buffer.from(functionSource, 'utf8').toString('base64')}`
);

function postRequest(payload) {
  return new Request('https://core.pro/api/send-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

async function withGateway(run, { apiKey = 'test-resend-key', fromEmail = '', fetchImpl } = {}) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;
  const calls = [];

  if (apiKey) process.env.RESEND_API_KEY = apiKey;
  else delete process.env.RESEND_API_KEY;
  if (fromEmail) process.env.RESEND_FROM_EMAIL = fromEmail;
  else delete process.env.RESEND_FROM_EMAIL;

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    return fetchImpl
      ? fetchImpl()
      : new Response(JSON.stringify({ id: 'resend-message-id' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
  };

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
  }
}

test('the gateway dispatches the reviewed draft through the Resend REST API', async () => {
  await withGateway(async (calls) => {
    const response = await sendEmail(postRequest({
      to: 'broker@charterer.com',
      subject: 'MV Seacharter · Firm offer',
      body: 'Estimados,\n\nAdjuntamos la oferta firme.\n\nSaludos.',
    }));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.id, 'resend-message-id');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.authorization, 'Bearer test-resend-key');
    assert.deepEqual(calls[0].body.to, ['broker@charterer.com']);
    assert.equal(calls[0].body.subject, 'MV Seacharter · Firm offer');
    assert.match(calls[0].body.text, /Adjuntamos la oferta firme\./);
    assert.equal(calls[0].body.from, 'SeaCharter Core PRO <no-reply@seacharter.app>');
  });
});

test('the gateway accepts the raw Data Bridge DRAFT_EMAIL field names', async () => {
  await withGateway(async (calls) => {
    const response = await sendEmail(postRequest({
      email_to: 'ops@charterer.com, chartering@charterer.com',
      email_subject: 'Laycan update',
      email_body: 'Laycan confirmado.',
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(calls[0].body.to, ['ops@charterer.com', 'chartering@charterer.com']);
    assert.equal(calls[0].body.subject, 'Laycan update');
  });
});

test('the static sender can be overridden by environment configuration', async () => {
  await withGateway(async (calls) => {
    await sendEmail(postRequest({ to: 'broker@charterer.com', subject: 'Hi', body: 'Body' }));
    assert.equal(calls[0].body.from, 'SeaCharter Ops <ops@seacharter.app>');
  }, { fromEmail: 'SeaCharter Ops <ops@seacharter.app>' });
});

test('the gateway rejects incomplete or malformed drafts before calling the provider', async () => {
  await withGateway(async (calls) => {
    const missingRecipient = await sendEmail(postRequest({ subject: 'Hi', body: 'Body' }));
    const missingSubject = await sendEmail(postRequest({ to: 'broker@charterer.com', body: 'Body' }));
    const missingBody = await sendEmail(postRequest({ to: 'broker@charterer.com', subject: 'Hi' }));
    const invalidAddress = await sendEmail(postRequest({ to: 'not-an-email', subject: 'Hi', body: 'Body' }));
    const invalidJson = await sendEmail(postRequest('{not json'));

    assert.equal(missingRecipient.status, 400);
    assert.equal(missingSubject.status, 400);
    assert.equal(missingBody.status, 400);
    assert.equal(invalidAddress.status, 400);
    assert.equal(invalidJson.status, 400);
    assert.equal(calls.length, 0);
    assert.match((await invalidAddress.json()).error, /no válida/);
  });
});

test('the gateway refuses non-POST verbs and reports a missing provider credential', async () => {
  await withGateway(async () => {
    const getResponse = await sendEmail(new Request('https://core.pro/api/send-email'));
    assert.equal(getResponse.status, 405);
  });

  await withGateway(async (calls) => {
    const response = await sendEmail(postRequest({ to: 'broker@charterer.com', subject: 'Hi', body: 'Body' }));
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  }, { apiKey: '' });
});

test('provider failures surface as gateway errors instead of silent successes', async () => {
  await withGateway(async () => {
    const response = await sendEmail(postRequest({ to: 'broker@charterer.com', subject: 'Hi', body: 'Body' }));
    const payload = await response.json();
    assert.equal(response.status, 422);
    assert.equal(payload.ok, false);
    assert.match(payload.error, /domain is not verified/);
  }, {
    fetchImpl: () => new Response(JSON.stringify({ message: 'The seacharter.app domain is not verified.' }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await withGateway(async () => {
    const response = await sendEmail(postRequest({ to: 'broker@charterer.com', subject: 'Hi', body: 'Body' }));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).ok, false);
  }, {
    fetchImpl: () => {
      throw new Error('socket hang up');
    },
  });
});

test('Core PRO intercepts DRAFT_EMAIL and routes it to the review modal instead of the calculator', () => {
  assert.match(frontendSource, /const normalizedActionName = String\(actionName \|\| ""\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(
    frontendSource,
    /if \(normalizedActionName === "DRAFT_EMAIL"\) \{\s*return openDraftEmailModal\(actionObj\);/,
  );
  // La interceptación precede a cualquier acción que escriba en la calculadora.
  assert.ok(
    frontendSource.indexOf('normalizedActionName === "DRAFT_EMAIL"')
      < frontendSource.indexOf('actionName === "update_fields"'),
  );
  assert.match(frontendSource, /\["email_to", "to", "recipient", "destinatario"\]/);
  assert.match(frontendSource, /\["email_subject", "subject", "asunto"\]/);
  assert.match(frontendSource, /\["email_body", "body", "message", "cuerpo"\]/);
});

test('the review modal posts the edited draft to the send-email function and confirms with a toast', () => {
  assert.match(frontendSource, /const DRAFT_EMAIL_ENDPOINT = "\/api\/send-email"/);
  assert.match(frontendSource, /await fetch\(DRAFT_EMAIL_ENDPOINT, \{\s*method: "POST"/);
  assert.match(frontendSource, /window\.showToast\?\.\("Correo enviado correctamente", false, "success"\)/);
  assert.match(frontendSource, /closeDraftEmailModal\(\);\s*return;/);
  assert.match(frontendSource, /<textarea class="sca-email-modal__textarea" name="body"/);
  assert.match(frontendSource, /toInput\.value = draft\.to/);
  assert.match(frontendSource, /subjectInput\.value = draft\.subject/);
  assert.match(frontendSource, /bodyInput\.value = draft\.body/);
  assert.match(stylesSource, /\.sca-email-modal \{/);
});
