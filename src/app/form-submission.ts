import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

type FormKind = 'contact' | 'podcast';
type DeliveryCode = 'unavailable' | 'verification_failed' | 'rate_limited' | 'delivery_failed' | 'invalid_request';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(container: HTMLElement): void;
  remove(widgetId: string): void;
}

type VerificationWindow = Window & { turnstile?: TurnstileApi };
const scriptLoads = new WeakMap<Document, Promise<TurnstileApi>>();

class DeliveryError extends Error {
  constructor(readonly code: DeliveryCode) { super(code); }
}

function loadVerification(document: Document): Promise<TurnstileApi> {
  const browser = document.defaultView as VerificationWindow | null;
  if (browser?.turnstile) return Promise.resolve(browser.turnstile);
  const existing = scriptLoads.get(document);
  if (existing) return existing;

  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    const fail = (): void => {
      clearTimeout(timer);
      script.remove();
      reject(new DeliveryError('verification_failed'));
    };
    const timer = setTimeout(fail, 15_000);
    script.onload = () => {
      clearTimeout(timer);
      if (browser?.turnstile) resolve(browser.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  scriptLoads.set(document, promise);
  void promise.catch(() => scriptLoads.delete(document));
  return promise;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = (): void => reject(new DOMException('Form closed', 'AbortError'));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

// Provide this service on each dialog component, so closing it cancels pending
// browser work and drops that form's in-memory request fingerprint.
@Injectable()
export class FormSubmission {
  private readonly document = inject(DOCUMENT);
  private readonly abort = new AbortController();
  private destroyed = false;
  private widget?: { api: TurnstileApi; id: string };
  private fingerprint = '';
  private requestId = '';

  readonly pending = signal(false);
  readonly sent = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.abort.abort();
      this.removeWidget();
      this.fingerprint = '';
      this.requestId = '';
    });
  }

  async submit(form: HTMLFormElement, kind: FormKind, container: HTMLElement): Promise<void> {
    if (this.destroyed || this.pending() || this.sent() || !form.reportValidity()) return;
    const data = new FormData(form);
    const field = (name: string): string => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const payload = {
      kind,
      fullName: field('fullName'),
      email: field('email'),
      message: field('message'),
      consent: data.has('consent'),
      website: field('website'),
      ...(kind === 'contact'
        ? { purpose: field('purpose'), phone: field('phone') }
        : { interest: field('interest'), socialProfile: field('socialProfile'), socialNetwork: field('socialNetwork') }),
    };

    this.pending.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      const config = await this.request('/api/forms/config', { method: 'GET' }, 8_000);
      if (this.destroyed) return;
      const body = config.body;
      if (!config.ok || body?.['available'] !== true || typeof body['turnstileSiteKey'] !== 'string') {
        throw new DeliveryError('unavailable');
      }
      const fingerprint = JSON.stringify(payload);
      if (fingerprint !== this.fingerprint || !this.requestId) {
        this.fingerprint = fingerprint;
        this.requestId = crypto.randomUUID();
      }
      const api = await abortable(loadVerification(this.document), this.abort.signal);
      const token = await this.verify(api, container, body['turnstileSiteKey'], kind);
      if (this.destroyed) return;
      const response = await this.request('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId: this.requestId, turnstileToken: token }),
      }, 25_000);
      if (!response.ok || response.status !== 202 || response.body?.['ok'] !== true) {
        const code = response.body?.['code'];
        throw new DeliveryError(
          code === 'verification_failed' || code === 'rate_limited' || code === 'invalid_request' || code === 'unavailable'
            ? code : 'delivery_failed',
        );
      }
      if (!this.destroyed) {
        this.sent.set(true);
        this.notice.set(kind === 'podcast'
          ? 'Your application has been accepted for email delivery. This does not confirm a booking.'
          : 'Your message has been accepted for email delivery.');
      }
    } catch (error: unknown) {
      if (this.destroyed) return;
      this.error.set(true);
      const code = error instanceof DeliveryError ? error.code : 'delivery_failed';
      const messages: Record<DeliveryCode, string> = {
        unavailable: 'Email delivery is currently unavailable. Please try again later. Your fields have been kept.',
        verification_failed: 'Verification could not be completed. Please try sending again. Your fields have been kept.',
        rate_limited: 'Too many attempts. Please wait a moment and try again. Your fields have been kept.',
        invalid_request: 'Please check the form fields and required confirmation, then try again.',
        delivery_failed: 'Email delivery could not be confirmed. Please try again. Your fields have been kept.',
      };
      this.notice.set(messages[code]);
    } finally {
      this.removeWidget();
      if (!this.destroyed) this.pending.set(false);
    }
  }

  private async request(path: string, init: RequestInit, timeout: number): Promise<{
    ok: boolean; status: number; body: Record<string, unknown> | null;
  }> {
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    if (this.abort.signal.aborted) controller.abort();
    this.abort.signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeout);
    try {
      const response = await fetch(new URL(path, this.document.baseURI), {
        ...init, signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status,
        body: body !== null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown> : null };
    } finally {
      clearTimeout(timer);
      this.abort.signal.removeEventListener('abort', cancel);
    }
  }

  private verify(api: TurnstileApi, container: HTMLElement, sitekey: string, kind: FormKind): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (token?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.abort.signal.removeEventListener('abort', cancel);
        if (token && token.length <= 2048) resolve(token);
        else reject(new DeliveryError('verification_failed'));
      };
      const cancel = (): void => finish();
      const timer = setTimeout(cancel, 60_000);
      if (this.abort.signal.aborted) { finish(); return; }
      this.abort.signal.addEventListener('abort', cancel, { once: true });
      try {
        const id = api.render(container, {
          sitekey, action: kind, execution: 'execute', appearance: 'interaction-only',
          theme: 'auto', language: 'en', size: 'compact', 'response-field': false,
          callback: (token: string) => finish(token),
          'error-callback': () => { finish(); return true; },
          'expired-callback': () => finish(), 'timeout-callback': () => finish(),
        });
        if (!id) { finish(); return; }
        this.widget = { api, id };
        api.execute(container);
      } catch { finish(); }
    });
  }

  private removeWidget(): void {
    const widget = this.widget;
    this.widget = undefined;
    if (widget) {
      try { widget.api.remove(widget.id); } catch { /* The runtime may already have removed it. */ }
    }
  }
}
