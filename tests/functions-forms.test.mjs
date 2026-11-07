import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { onRequest } from '../functions/api/forms.ts';
import { onRequest as configurationRequest } from '../functions/api/forms/config.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const origin = 'https://syohtimofey.com';
const environment = {
  RESEND_API_KEY: 're_unit_test_secret_not_live',
  FORM_FROM_EMAIL: 'forms@syohtimofey.com',
  TURNSTILE_SITE_KEY: '0x4AAAAA_unit_test_sitekey',
  TURNSTILE_SECRET_KEY: '0x4AAAAA_unit_test_secret_not_live',
};
const contact = {
  kind: 'contact',
  requestId: '82ed21e0-24fe-4f40-8fc2-bd499288e7d9',
  fullName: 'Test Visitor',
  email: 'visitor@example.com',
  message: 'A first line.\nA second line.',
  consent: true,
  website: '',
  turnstileToken: 'unit-test-token',
  purpose: 'Ordering a service',
  phone: '+380000000000',
};
const podcast = {
  kind: 'podcast',
  requestId: '22b668a8-58db-4dd0-a5c8-c2a99dc5b530',
  fullName: 'Guest Example',
  email: 'guest+podcast@example.com',
  message: 'I would like to join the conversation.',
  consent: true,
  website: '',
  turnstileToken: 'unit-test-token',
  interest: 'guest',
  socialProfile: '@guest',
  socialNetwork: 'instagram',
};

function request(payload = contact, options = {}) {
  const { headers = {}, body = JSON.stringify(payload), ...rest } = options;
  return new Request(`${origin}/api/forms`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body,
    ...rest,
  });
}

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubNetwork(verification = { success: true, hostname: 'syohtimofey.com', action: 'contact' }, delivery = { id: 'email-unit-test-id' }, deliveryStatus = 200) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return respond(verification);
    if (url === 'https://api.resend.com/emails') return respond(delivery, deliveryStatus);
    throw new Error('Unexpected outbound request');
  };
  return calls;
}

async function submit(payload = contact, env = environment, options) {
  return onRequest({ request: request(payload, options), env });
}

test('configuration exposes only the public site key and is never cached', async () => {
  const response = configurationRequest({ request: new Request(`${origin}/api/forms/config`), env: environment });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: true, turnstileSiteKey: environment.TURNSTILE_SITE_KEY });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=15552000');
});

test('configuration fails closed when required settings are missing or dummy Turnstile keys are used', async () => {
  for (const env of [
    {},
    { ...environment, RESEND_API_KEY: '' },
    { ...environment, RESEND_API_KEY: 're_invalid whitespace' },
    { ...environment, FORM_FROM_EMAIL: 'invalid' },
    { ...environment, FORM_FROM_EMAIL: 'Other <forms@syohtimofey.com>' },
    { ...environment, FORM_TO_EMAIL: 'first@example.com,second@example.com' },
    { ...environment, TURNSTILE_SECRET_KEY: undefined },
    { ...environment, TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
    { ...environment, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' },
  ]) {
    const response = configurationRequest({ request: new Request(`${origin}/api/forms/config`), env });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { available: false });
  }
});

test('configuration rejects non-GET methods', () => {
  const response = configurationRequest({ request: new Request(`${origin}/api/forms/config`, { method: 'POST' }), env: environment });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
});

test('POST delivery fails closed without configuration and makes no outgoing requests', async () => {
  const calls = stubNetwork();
  const response = await submit(contact, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: 'unavailable' });
  assert.equal(calls.length, 0);
});

test('rejects unsupported methods, cross-origin or missing Origin and non-JSON requests before network access', async () => {
  const calls = stubNetwork();
  const unsupported = await onRequest({ request: new Request(`${origin}/api/forms`), env: environment });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get('Allow'), 'POST');
  for (const Origin of ['', 'null', 'https://attacker.example']) {
    assert.equal((await submit(contact, environment, { headers: { Origin } })).status, 403);
  }
  assert.equal((await submit(contact, environment, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await submit(contact, environment, { headers: { 'Content-Encoding': 'gzip' } })).status, 415);
  assert.equal(calls.length, 0);
});

test('rejects invalid JSON and UTF-8', async () => {
  const calls = stubNetwork();
  assert.equal((await submit(contact, environment, { body: '{' })).status, 400);
  assert.equal((await submit(contact, environment, { body: new Uint8Array([0xff]) })).status, 400);
  assert.equal(calls.length, 0);
});

test('bounds JSON bodies using both Content-Length and streamed bytes', async () => {
  const calls = stubNetwork();
  assert.equal((await submit(contact, environment, { headers: { 'Content-Length': '12289' } })).status, 413);
  assert.equal((await submit(contact, environment, { headers: { 'Content-Length': 'bogus' } })).status, 400);
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(7_000));
      controller.enqueue(new Uint8Array(7_000));
    },
    cancel() { cancelled = true; },
  });
  const response = await submit(contact, environment, { body, duplex: 'half' });
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.equal(calls.length, 0);
});

test('rejects invalid payload types, unsupported fields, honeypots and missing acknowledgements', async () => {
  const calls = stubNetwork();
  for (const invalid of [
    null, [], false, '',
    { ...contact, kind: 'other' },
    { ...contact, to: 'attacker@example.com' },
    { ...contact, socialNetwork: 'youtube' },
    { ...contact, consent: 'true' },
    { ...contact, consent: false },
    { ...contact, website: 'bot.example' },
    { ...contact, website: undefined },
    { ...contact, requestId: 'not-a-uuid' },
    { ...contact, fullName: {} },
    { ...contact, fullName: '  ' },
    { ...contact, email: 'a@example.com\r\nBcc:attacker@example.com' },
    { ...contact, fullName: 'name\nheader' },
    { ...contact, message: '\0invalid' },
    { ...contact, message: '\n  ' },
    { ...contact, purpose: 'Unsupported' },
    { ...contact, turnstileToken: '' },
    { ...contact, turnstileToken: 'token whitespace' },
    { ...contact, phone: 123 },
  ]) {
    assert.equal((await submit(invalid)).status, 400, JSON.stringify(invalid));
  }
  assert.equal(calls.length, 0);
});

test('enforces the browser field limits on the server', async () => {
  const calls = stubNetwork();
  for (const invalid of [
    ...[contact, podcast].flatMap((form) => [
      { ...form, fullName: 'a'.repeat(51) },
      { ...form, email: `${'a'.repeat(64)}@${'b'.repeat(32)}.com` },
      { ...form, message: 'a'.repeat(1501) },
    ]),
    { ...contact, phone: '1'.repeat(21) },
    { ...contact, turnstileToken: 'a'.repeat(2049) },
    { ...podcast, socialProfile: 'a'.repeat(41) },
  ]) assert.equal((await submit(invalid)).status, 400);
  assert.equal(calls.length, 0);

  for (const form of [
    { ...contact, phone: '1'.repeat(20) },
    { ...podcast, socialProfile: 'a'.repeat(40) },
  ]) {
    stubNetwork({ success: true, hostname: 'syohtimofey.com', action: form.kind });
    assert.equal((await submit({
      ...form,
      fullName: 'a'.repeat(50),
      email: `${'a'.repeat(64)}@${'b'.repeat(31)}.com`,
      message: 'a'.repeat(1500),
    })).status, 202);
  }
});

test('rejects unsupported podcast request and network values', async () => {
  const calls = stubNetwork();
  for (const invalid of [
    { ...podcast, interest: 'other' },
    { ...podcast, interest: '__proto__' },
    { ...podcast, socialProfile: '' },
    { ...podcast, socialNetwork: 'facebook' },
    { ...podcast, purpose: 'Ordering a service' },
  ]) assert.equal((await submit(invalid)).status, 400);
  assert.equal(calls.length, 0);
});

test('never calls Resend when Turnstile fails or action/hostname differs', async () => {
  for (const result of [
    { success: false },
    { success: 'true', action: 'contact', hostname: 'syohtimofey.com' },
    { success: true, action: 'podcast', hostname: 'syohtimofey.com' },
    { success: true, action: 'contact', hostname: 'attacker.example' },
    { success: true },
    null,
  ]) {
    const calls = stubNetwork(result);
    const response = await submit();
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, code: 'verification_failed' });
    assert.equal(calls.length, 1);
  }
});

test('Turnstile network errors fail closed without exposing upstream details', async () => {
  globalThis.fetch = async () => { throw new Error('private-upstream-detail'); };
  const response = await submit();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: 'unavailable' });
});

test('Turnstile HTTP errors fail closed', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return respond({ secret: 'private-detail' }, 500); };
  const response = await submit();
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test('contact mail has a fixed recipient/from/subject, Reply-To and deterministic idempotency key', async () => {
  const calls = stubNetwork();
  const response = await submit();
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].init.body), { secret: environment.TURNSTILE_SECRET_KEY, response: contact.turnstileToken });
  const email = JSON.parse(calls[1].init.body);
  assert.deepEqual(email.to, ['timofeysyoh@gmail.com']);
  assert.equal(email.from, environment.FORM_FROM_EMAIL);
  assert.equal(email.reply_to, contact.email);
  assert.equal(email.subject, '[syohtimofey.com] Contact request');
  assert.equal(email.html, undefined);
  assert.ok(email.text.includes(contact.message));
  assert.ok(email.text.includes('Acknowledgement text version: 2026-11-07'));
  assert.equal(calls[1].init.headers['Idempotency-Key'], `forms/contact/${contact.requestId}`);
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${environment.RESEND_API_KEY}`);
  await submit();
  assert.equal(calls[3].init.headers['Idempotency-Key'], calls[1].init.headers['Idempotency-Key']);
  assert.equal(calls[3].init.body, calls[1].init.body);
});

test('podcast mail includes the selected social network, request and acknowledgement', async () => {
  const calls = stubNetwork({ success: true, action: 'podcast', hostname: 'syohtimofey.com' });
  const response = await submit(podcast, { ...environment, FORM_TO_EMAIL: 'owner@example.com' });
  assert.equal(response.status, 202);
  const email = JSON.parse(calls[1].init.body);
  assert.deepEqual(email.to, ['owner@example.com']);
  assert.equal(email.reply_to, podcast.email);
  assert.equal(email.subject, '[syohtimofey.com] Podcast application');
  assert.ok(email.text.includes('Request: Join as a guest'));
  assert.ok(email.text.includes('Social network: instagram'));
  assert.ok(email.text.includes('Social username: @guest'));
  assert.ok(email.text.includes('I have read the Podcast Terms.'));
  assert.equal(calls[1].init.headers['Idempotency-Key'], `forms/podcast/${podcast.requestId}`);
});

test('optional contact phone may be omitted', async () => {
  const calls = stubNetwork();
  const { phone, ...withoutPhone } = contact;
  assert.equal((await submit(withoutPhone)).status, 202);
  assert.ok(JSON.parse(calls[1].init.body).text.includes('Phone: (not provided)'));
});

test('returns a retryable generic response when Resend rate limits requests', async () => {
  stubNetwork(undefined, { message: 'upstream private details' }, 429);
  const response = await submit();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.deepEqual(await response.json(), { ok: false, code: 'rate_limited' });
});

test('does not claim success for failed, malformed or incomplete Resend responses', async () => {
  for (const [status, body] of [[403, { message: 'private details' }], [500, {}], [200, {}], [200, { id: '' }], [200, null]]) {
    stubNetwork(undefined, body, status);
    const response = await submit();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { ok: false, code: 'delivery_failed' });
  }
});

test('handles Resend network failure without exposing submitted fields or credentials', async () => {
  globalThis.fetch = async (url) => {
    if (url.includes('siteverify')) return respond({ success: true, action: 'contact', hostname: 'syohtimofey.com' });
    throw new Error('private details');
  };
  const response = await submit();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, code: 'delivery_failed' });
});
