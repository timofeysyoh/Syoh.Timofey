import { TestBed } from '@angular/core/testing';
import { FormSubmission } from './form-submission';

type VerificationApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(container: HTMLElement): void;
  remove(widgetId: string): void;
};

describe('FormSubmission', () => {
  const browser = window as Window & { turnstile?: VerificationApi };
  const fetchMock = vi.fn<typeof fetch>();
  let originalVerification: VerificationApi | undefined;
  let delivery: FormSubmission;
  let form: HTMLFormElement;
  let container: HTMLElement;
  let verification: {
    render: ReturnType<typeof vi.fn<VerificationApi['render']>>;
    execute: ReturnType<typeof vi.fn<VerificationApi['execute']>>;
    remove: ReturnType<typeof vi.fn<VerificationApi['remove']>>;
  };
  let verificationOptions: Record<string, unknown>[];
  let completeVerification: boolean;
  let posts: Record<string, unknown>[];
  let postResponses: Response[];

  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  const pathOf = (input: RequestInfo | URL): string => new URL(
    input instanceof Request ? input.url : input.toString(), document.baseURI,
  ).pathname;

  function makeForm(kind: 'contact' | 'podcast' = 'contact'): HTMLFormElement {
    const element = document.createElement('form');
    element.innerHTML = `
      <input name="fullName" value="Test Guest" required maxlength="50">
      <input name="email" type="email" value="guest@example.com" required maxlength="100">
      <textarea name="message" required maxlength="1500">A conversation about music.</textarea>
      <input name="consent" type="checkbox" checked required>
      <input name="website" value="" tabindex="-1">
      ${kind === 'contact'
        ? '<select name="purpose" required><option selected>Ordering a service</option></select><input name="phone" value="+380123456789" maxlength="20">'
        : '<select name="interest" required><option value="guest" selected>Join as a guest</option></select><input name="socialProfile" value="@guest" required maxlength="40"><input name="socialNetwork" type="hidden" value="instagram">'}
      <div class="verification"></div>`;
    document.body.append(element);
    return element;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [FormSubmission] });
    delivery = TestBed.inject(FormSubmission);
    form = makeForm();
    container = form.querySelector('.verification')!;
    posts = [];
    postResponses = [];
    verificationOptions = [];
    completeVerification = true;
    originalVerification = browser.turnstile;
    verification = {
      render: vi.fn((_element, options) => {
        verificationOptions.push(options);
        return `widget-${verificationOptions.length}`;
      }),
      execute: vi.fn(() => {
        if (!completeVerification) return;
        const index = verificationOptions.length - 1;
        (verificationOptions[index]['callback'] as (token: string) => void)(`verification-token-${index + 1}`);
      }),
      remove: vi.fn(),
    };
    browser.turnstile = verification;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      if (pathOf(input) === '/api/forms/config') {
        return json({ available: true, turnstileSiteKey: 'public-site-key' });
      }
      if (pathOf(input) === '/api/forms' && init?.method === 'POST') {
        posts.push(JSON.parse(init.body as string));
        return postResponses.shift() ?? json({ ok: true }, 202);
      }
      throw new Error('Unexpected request in isolated form test');
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    form.remove();
    if (originalVerification) browser.turnstile = originalVerification;
    else delete browser.turnstile;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not request configuration or verification for an invalid native form', async () => {
    form.querySelector<HTMLInputElement>('[name="consent"]')!.checked = false;
    expect(form.checkValidity()).toBe(false);

    await delivery.submit(form, 'contact', container);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(verification.render).not.toHaveBeenCalled();
    expect(delivery.pending()).toBe(false);
    expect(delivery.sent()).toBe(false);
  });

  it('reports disabled delivery without loading Turnstile or posting the fields', async () => {
    delete browser.turnstile;
    fetchMock.mockResolvedValue(json({ available: false }, 503));
    const scriptsBefore = document.querySelectorAll('script[src*="challenges.cloudflare.com"]').length;

    await delivery.submit(form, 'contact', container);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pathOf(fetchMock.mock.calls[0][0])).toBe('/api/forms/config');
    expect(document.querySelectorAll('script[src*="challenges.cloudflare.com"]').length).toBe(scriptsBefore);
    expect(posts).toHaveLength(0);
    expect(delivery.error()).toBe(true);
    expect(delivery.notice()).toContain('currently unavailable');
    expect(form.querySelector<HTMLInputElement>('[name="email"]')!.value).toBe('guest@example.com');
  });

  it('posts contact fields only after verification and accepts success only from the delivery endpoint', async () => {
    await delivery.submit(form, 'contact', container);

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      kind: 'contact', fullName: 'Test Guest', email: 'guest@example.com',
      purpose: 'Ordering a service', phone: '+380123456789',
      message: 'A conversation about music.', consent: true, website: '',
      turnstileToken: 'verification-token-1',
    });
    expect(posts[0]['requestId']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(verification.render).toHaveBeenCalledWith(container, expect.objectContaining({
      sitekey: 'public-site-key', action: 'contact', execution: 'execute', appearance: 'interaction-only',
    }));
    expect(verification.remove).toHaveBeenCalledWith('widget-1');
    expect(delivery.pending()).toBe(false);
    expect(delivery.sent()).toBe(true);
    expect(delivery.error()).toBe(false);
    expect(delivery.notice()).toBe('Message sent');
  });

  it('includes the podcast request and selected network in application delivery', async () => {
    form.remove();
    form = makeForm('podcast');
    container = form.querySelector('.verification')!;

    await delivery.submit(form, 'podcast', container);

    expect(posts[0]).toMatchObject({
      kind: 'podcast', interest: 'guest', socialProfile: '@guest', socialNetwork: 'instagram', consent: true,
    });
    expect(posts[0]).not.toHaveProperty('purpose');
    expect(posts[0]).not.toHaveProperty('phone');
    expect(verificationOptions[0]['action']).toBe('podcast');
    expect(delivery.notice()).toBe('Application sent');
  });

  it('ignores a second submission while pending and any submission after acceptance', async () => {
    let acceptPost!: (response: Response) => void;
    const pendingPost = new Promise<Response>((resolve) => { acceptPost = resolve; });
    fetchMock.mockImplementation(async (input, init) => {
      if (pathOf(input) === '/api/forms/config') return json({ available: true, turnstileSiteKey: 'public-site-key' });
      posts.push(JSON.parse(init!.body as string));
      return pendingPost;
    });

    const first = delivery.submit(form, 'contact', container);
    expect(delivery.pending()).toBe(true);
    expect(delivery.phase()).toBe('verifying');
    await delivery.submit(form, 'contact', container);
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(delivery.pending()).toBe(true);
    expect(delivery.phase()).toBe('sending');
    acceptPost(json({ ok: true }, 202));
    await first;
    expect(delivery.pending()).toBe(false);
    expect(delivery.phase()).toBe('idle');
    await delivery.submit(form, 'contact', container);

    expect(posts).toHaveLength(1);
    expect(verification.render).toHaveBeenCalledTimes(1);
    expect(delivery.sent()).toBe(true);
  });

  it('keeps fields and reuses a request ID with a fresh verification token after an uncertain failure', async () => {
    postResponses.push(json({ ok: false, code: 'delivery_failed' }, 502));

    await delivery.submit(form, 'contact', container);
    expect(delivery.sent()).toBe(false);
    expect(delivery.pending()).toBe(false);
    expect(delivery.error()).toBe(true);
    expect(form.querySelector<HTMLTextAreaElement>('[name="message"]')!.value).toBe('A conversation about music.');
    expect(delivery.notice()).toContain('could not be confirmed');

    await delivery.submit(form, 'contact', container);

    expect(posts).toHaveLength(2);
    expect(posts[1]['requestId']).toBe(posts[0]['requestId']);
    expect(posts[1]['turnstileToken']).not.toBe(posts[0]['turnstileToken']);
    expect(verification.remove).toHaveBeenCalledTimes(2);
    expect(delivery.error()).toBe(false);
    expect(delivery.sent()).toBe(true);
  });

  it('allocates a new idempotency ID when fields change after a failed attempt', async () => {
    postResponses.push(json({ ok: false, code: 'delivery_failed' }, 502));
    await delivery.submit(form, 'contact', container);
    form.querySelector<HTMLTextAreaElement>('[name="message"]')!.value = 'A different conversation.';

    await delivery.submit(form, 'contact', container);

    expect(posts).toHaveLength(2);
    expect(posts[1]['requestId']).not.toBe(posts[0]['requestId']);
    expect(posts[1]['message']).toBe('A different conversation.');
  });

  it('aborts an in-flight configuration request when the dialog is destroyed without showing a failure notice', async () => {
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      requestSignal = init!.signal as AbortSignal;
      requestSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const pending = delivery.submit(form, 'contact', container);
    expect(requestSignal?.aborted).toBe(false);

    TestBed.resetTestingModule();
    await pending;

    expect(requestSignal?.aborted).toBe(true);
    expect(verification.render).not.toHaveBeenCalled();
    expect(delivery.sent()).toBe(false);
    expect(delivery.notice()).toBe('');
    expect(delivery.error()).toBe(false);
  });

  it('removes an unfinished widget on destruction and ignores a late verification callback', async () => {
    completeVerification = false;
    const pending = delivery.submit(form, 'contact', container);
    await vi.waitFor(() => expect(verification.execute).toHaveBeenCalledWith(container));

    TestBed.resetTestingModule();
    await pending;
    (verificationOptions[0]['callback'] as (token: string) => void)('late-token');

    expect(verification.remove).toHaveBeenCalledTimes(1);
    expect(verification.remove).toHaveBeenCalledWith('widget-1');
    expect(posts).toHaveLength(0);
    expect(delivery.notice()).toBe('');
    expect(delivery.error()).toBe(false);
  });
});
