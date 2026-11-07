/** Cloudflare Pages endpoint. Nothing in this module is imported by the browser. */
export interface FormEnvironment {
  RESEND_API_KEY?: string;
  FORM_FROM_EMAIL?: string;
  FORM_TO_EMAIL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export interface FormContext {
  request: Request;
  env: FormEnvironment;
}

type FormKind = 'contact' | 'podcast';
type ErrorCode = 'invalid_request' | 'verification_failed' | 'unavailable' | 'delivery_failed' | 'rate_limited';
interface Configuration {
  apiKey: string;
  from: string;
  to: string;
  siteKey: string;
  secretKey: string;
}
interface Submission {
  kind: FormKind;
  requestId: string;
  fullName: string;
  email: string;
  message: string;
  token: string;
  purpose?: string;
  phone?: string;
  interest?: string;
  socialProfile?: string;
  socialNetwork?: string;
}

const MAX_BODY_BYTES = 12 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const MESSAGE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ACKNOWLEDGEMENT_VERSION = '2026-11-07';
const COMMON_FIELDS = ['kind', 'requestId', 'fullName', 'email', 'message', 'consent', 'website', 'turnstileToken'];
const PURPOSES = ['Ordering a service', 'Something else'];
const INTERESTS: Record<string, string> = {
  guest: 'Join as a guest',
  'suggest-guest': 'Suggest a guest',
  collaboration: 'Commission a podcast or collaborate',
};
const NETWORKS = ['youtube', 'instagram', 'tiktok'];

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'Strict-Transport-Security': 'max-age=15552000',
      ...extraHeaders,
    },
  });
}

function failure(code: ErrorCode, status: number, extraHeaders?: Record<string, string>): Response {
  return jsonResponse({ ok: false, code }, status, extraHeaders);
}

function emailAddress(value: string): boolean {
  if (value.length > 254 || SINGLE_LINE_CONTROL.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local = '', domain = ''] = parts;
  return local.length > 0 && local.length <= 64 &&
    !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) &&
    domain.includes('.') && domain.length <= 253 &&
    domain.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function setting(value: unknown, maximum = 256): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum && !SINGLE_LINE_CONTROL.test(trimmed) ? trimmed : null;
}

export function getDeliveryConfiguration(env: FormEnvironment): Configuration | null {
  const apiKey = setting(env.RESEND_API_KEY);
  const from = setting(env.FORM_FROM_EMAIL);
  const to = setting(env.FORM_TO_EMAIL ?? 'timofeysyoh@gmail.com');
  const siteKey = setting(env.TURNSTILE_SITE_KEY);
  const secretKey = setting(env.TURNSTILE_SECRET_KEY);
  // Cloudflare's published dummy keys are for isolated tests, never live mail.
  const dummyKey = /^[123]x0{8,}/;
  if (!apiKey?.startsWith('re_') || /\s/.test(apiKey) || !from || !to || !emailAddress(from) || !emailAddress(to) ||
      !siteKey || !secretKey || /\s/.test(siteKey) || /\s/.test(secretKey) ||
      dummyKey.test(siteKey) || dummyKey.test(secretKey)) return null;
  return { apiKey, from, to, siteKey, secretKey };
}

class InvalidBody extends Error {
  readonly status: number;
  constructor(status: number) {
    super('Invalid request body');
    this.status = status;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new InvalidBody(/^\d+$/.test(length) ? 413 : 400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidBody(400);
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new InvalidBody(413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidBody(400);
  }
}

function line(value: unknown, maximum: number, optional = false): string | null {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.length > maximum || SINGLE_LINE_CONTROL.test(value)) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 || optional ? trimmed : null;
}

function validateSubmission(value: unknown): Submission | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const kind = input['kind'];
  if (kind !== 'contact' && kind !== 'podcast') return null;
  const allowed = new Set([...COMMON_FIELDS, ...(kind === 'contact' ? ['purpose', 'phone'] : ['interest', 'socialProfile', 'socialNetwork'])]);
  if (Object.keys(input).some((key) => !allowed.has(key)) || input['consent'] !== true || input['website'] !== '') return null;
  const requestId = line(input['requestId'], 36);
  const fullName = line(input['fullName'], 100);
  const email = line(input['email'], 254);
  const token = line(input['turnstileToken'], 2048);
  const rawMessage = input['message'];
  if (!requestId || !UUID.test(requestId) || !fullName || !email || !emailAddress(email) ||
      !token || /\s/.test(token) || typeof rawMessage !== 'string' || rawMessage.length > 1500 ||
      MESSAGE_CONTROL.test(rawMessage) || !rawMessage.trim()) return null;
  const submission: Submission = {
    kind, requestId: requestId.toLowerCase(), fullName, email, token, message: rawMessage.trim(),
  };
  if (kind === 'contact') {
    const purpose = line(input['purpose'], 40);
    const phone = line(input['phone'], 30, true);
    if (!purpose || !PURPOSES.includes(purpose) || phone === null) return null;
    return { ...submission, purpose, phone };
  }
  const interest = line(input['interest'], 40);
  const socialProfile = line(input['socialProfile'], 160);
  const socialNetwork = line(input['socialNetwork'], 20);
  if (!interest || !Object.hasOwn(INTERESTS, interest) || !socialProfile || !socialNetwork || !NETWORKS.includes(socialNetwork)) return null;
  return { ...submission, interest, socialProfile, socialNetwork };
}

async function upstreamJson(url: string, init: RequestInit, requestSignal: AbortSignal, timeoutMs: number): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (requestSignal.aborted) controller.abort();
  else requestSignal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let data: unknown;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
    requestSignal.removeEventListener('abort', abort);
  }
}

function mailText(submission: Submission): string {
  const details = submission.kind === 'contact'
    ? [`Purpose: ${submission.purpose}`, `Phone: ${submission.phone || '(not provided)'}`]
    : [`Request: ${INTERESTS[submission.interest!]}`, `Social network: ${submission.socialNetwork}`, `Social username: ${submission.socialProfile}`];
  const acknowledgement = submission.kind === 'contact'
    ? 'I accept that the statement does not encourage fraud.'
    : 'I confirm that my application is accurate and I have read the Podcast Terms.';
  return [
    submission.kind === 'contact' ? 'New website contact request' : 'New podcast application',
    '', `Full name: ${submission.fullName}`, `Email: ${submission.email}`, ...details,
    '', 'Message:', submission.message, '',
    `Form acknowledgement checked: ${acknowledgement}`,
    `Acknowledgement text version: ${ACKNOWLEDGEMENT_VERSION}`,
    `Request reference: ${submission.requestId}`,
    ...(submission.kind === 'podcast' ? ['An application does not confirm a booking or give recording/publication permission.'] : []),
  ].join('\n');
}

export async function onRequest({ request, env }: FormContext): Promise<Response> {
  if (request.method !== 'POST') return failure('invalid_request', 405, { Allow: 'POST' });
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin) return failure('invalid_request', 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '') ||
      !['', 'identity'].includes(request.headers.get('Content-Encoding') ?? '')) return failure('invalid_request', 415);
  let body: unknown;
  try { body = await readJson(request); } catch (error) {
    return failure('invalid_request', error instanceof InvalidBody ? error.status : 400);
  }
  const submission = validateSubmission(body);
  if (!submission) return failure('invalid_request', 400);
  const config = getDeliveryConfiguration(env);
  if (!config) return failure('unavailable', 503);

  try {
    const verification = await upstreamJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: config.secretKey, response: submission.token }),
    }, request.signal, 8_000);
    if (!verification.ok) return failure('unavailable', 503);
    const result = verification.data as Record<string, unknown> | null;
    if (!result || result['success'] !== true || result['action'] !== submission.kind || result['hostname'] !== url.hostname) {
      return failure('verification_failed', 400);
    }
  } catch {
    return failure('unavailable', 503);
  }
  if (request.signal.aborted) return failure('unavailable', 503);

  try {
    const delivery = await upstreamJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `forms/${submission.kind}/${submission.requestId}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        reply_to: submission.email,
        subject: submission.kind === 'contact' ? '[syohtimofey.com] Contact request' : '[syohtimofey.com] Podcast application',
        text: mailText(submission),
      }),
    }, request.signal, 10_000);
    if (delivery.status === 429) return failure('rate_limited', 429, { 'Retry-After': '60' });
    const result = delivery.data as Record<string, unknown> | null;
    if (!delivery.ok || !result || typeof result['id'] !== 'string' || !result['id']) return failure('delivery_failed', 502);
    // Acceptance by Resend is not a claim of final inbox delivery.
    return jsonResponse({ ok: true }, 202);
  } catch {
    // A retry with the same requestId uses the same provider idempotency key.
    return failure('delivery_failed', 502);
  }
}
