import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Home } from './home';
import { ContactPanel } from './contact-panel/contact-panel';
import { FormSubmission } from './form-submission';
import { SubmissionNotificationService } from './submission-notification';

describe('Home scroll handling', () => {
  let fixture: ComponentFixture<Home>;
  let scroller: HTMLElement;
  let title: HTMLElement;
  let titleTop: number;
  let callbacks: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  function flushFrame(): void {
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(0);
  }

  beforeEach(async () => {
    callbacks = new Map();
    nextFrame = 0;
    titleTop = 100;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      callbacks.delete(id);
    });

    TestBed.configureTestingModule({ imports: [Home], providers: [provideRouter([])] });
    TestBed.overrideTemplate(
      Home,
      `
      <main #pageScroller>
        <h1 #brandTitle [class.brand-title--compact]="brandCompact">Syoh Timofey</h1>
      </main>
    `,
    );
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await fixture.whenStable();
    scroller = fixture.nativeElement.querySelector('main');
    title = fixture.nativeElement.querySelector('h1');
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => ({ top: 0 }) as DOMRect);
    vi.spyOn(title, 'getBoundingClientRect').mockImplementation(
      () => ({ top: titleTop }) as DOMRect,
    );
    flushFrame();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('coalesces scroll bursts and checks geometry only once per animation frame', () => {
    scroller.scrollTop = 20;
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new Event('scroll'));

    expect(callbacks.size).toBe(1);
    expect(title.getBoundingClientRect).not.toHaveBeenCalled();
    flushFrame();
    expect(title.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(scroller.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.brandCompact).toBe(false);
  });

  it('compacts at the sticky edge and restores the header when returning to the top', async () => {
    scroller.scrollTop = 200;
    titleTop = 16;
    scroller.dispatchEvent(new Event('scroll'));
    flushFrame();
    await fixture.whenStable();
    expect(fixture.componentInstance.brandCompact).toBe(true);
    expect(title.classList.contains('brand-title--compact')).toBe(true);

    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    flushFrame();
    await fixture.whenStable();
    expect(fixture.componentInstance.brandCompact).toBe(false);
    expect(title.classList.contains('brand-title--compact')).toBe(false);
    // Returning to scrollTop 0 short-circuits layout reads.
    expect(title.getBoundingClientRect).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work and removes the listener when the page is destroyed', () => {
    scroller.scrollTop = 200;
    titleTop = 16;
    scroller.dispatchEvent(new Event('scroll'));
    const pending = [...callbacks.values()];
    expect(callbacks.size).toBe(1);

    fixture.destroy();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);

    // A callback already handed to the browser cannot update the destroyed view.
    for (const callback of pending) callback(0);
    scroller.dispatchEvent(new Event('scroll'));
    expect(callbacks.size).toBe(0);
    expect(fixture.componentInstance.brandCompact).toBe(false);
    expect(title.getBoundingClientRect).not.toHaveBeenCalled();
  });
});

describe('Home deferred contact panel', () => {
  let fixture: ComponentFixture<Home>;
  let deliveries: ReturnType<typeof createDeliveryMock>[];
  let notifications: { show: ReturnType<typeof vi.fn> };
  let restoreDialogs: () => void;

  function createDeliveryMock() {
    return {
      pending: signal(false),
      phase: signal<'idle' | 'verifying' | 'sending'>('idle'),
      sent: signal(false),
      notice: signal(''),
      error: signal(false),
      submit: vi.fn(async (_form: HTMLFormElement, _kind: string, _container: HTMLElement) => {}),
    };
  }

  beforeEach(async () => {
    // Use the real Home template, including its backdrop event binding.
    TestBed.resetTestingModule();
    deliveries = [];
    notifications = { show: vi.fn() };
    const prototype = HTMLDialogElement.prototype;
    const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal');
    const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close');
    Object.defineProperty(prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    restoreDialogs = () => {
      if (originalShow) Object.defineProperty(prototype, 'showModal', originalShow);
      else Reflect.deleteProperty(prototype, 'showModal');
      if (originalClose) Object.defineProperty(prototype, 'close', originalClose);
      else Reflect.deleteProperty(prototype, 'close');
    };
    TestBed.overrideComponent(ContactPanel, {
      set: { providers: [{ provide: FormSubmission, useFactory: () => {
        const delivery = createDeliveryMock();
        deliveries.push(delivery);
        return delivery;
      } }] },
    });
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), { provide: SubmissionNotificationService, useValue: notifications }],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    }).compileComponents();
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    restoreDialogs();
  });

  async function openContactPanel(): Promise<HTMLElement> {
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.footer-button--contact')!.click();
    await fixture.whenStable();
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    await fixture.whenStable();
    return page;
  }

  it('allows textarea resizing without dismissing the panel when the pointer is released outside', async () => {
    const page = await openContactPanel();

    const textarea = page.querySelector<HTMLTextAreaElement>('#contact-message');
    const backdrop = page.querySelector<HTMLElement>('.contact-panel-backdrop');
    expect(textarea).not.toBeNull();
    expect(backdrop).not.toBeNull();
    expect(page.querySelector('[role="dialog"]')).not.toBeNull();

    const resizeStart = new Event('pointerdown', { bubbles: true, cancelable: true });
    expect(textarea!.dispatchEvent(resizeStart)).toBe(true);
    expect(resizeStart.defaultPrevented).toBe(false);
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).not.toBeNull();

    // A resize started inside may produce a backdrop click when released outside.
    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).not.toBeNull();

    backdrop!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });

  it('focuses the loaded form, delegates delivery without native navigation and clears a closed form', async () => {
    const page = await openContactPanel();
    const dialog = page.querySelector<HTMLElement>('[role="dialog"]')!;
    const close = dialog.querySelector<HTMLButtonElement>('.contact-panel__close')!;
    const send = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const name = dialog.querySelector<HTMLInputElement>('#contact-full-name')!;
    const message = dialog.querySelector<HTMLTextAreaElement>('#contact-message')!;
    expect(document.activeElement).toBe(name);
    expect(page.querySelector('main')!.hasAttribute('inert')).toBe(true);

    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(send);
    send.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(close);

    name.value = 'Test visitor';
    message.value = 'Test enquiry';
    message.dispatchEvent(new Event('input', { bubbles: true }));
    const delivery = deliveries[0];
    const form = dialog.querySelector('form')!;
    const verification = page.querySelector('.contact-form__verification');
    await fixture.whenStable();
    expect(dialog.querySelector('.contact-field__counter')!.textContent).toContain('12/1500');
    delivery.submit.mockImplementation(async () => {
      delivery.sent.set(true);
      delivery.notice.set('Message sent');
    });
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    expect(dialog.querySelector('form')!.dispatchEvent(submit)).toBe(false);
    await fixture.whenStable();
    expect(delivery.submit).toHaveBeenCalledWith(
      form, 'contact', verification,
    );
    expect(notifications.show).toHaveBeenCalledExactlyOnceWith('contact');
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(page.querySelector('main')!.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(page.querySelector('.footer-button--contact'));

    await openContactPanel();
    expect(page.querySelector<HTMLInputElement>('#contact-full-name')!.value).toBe('');
    expect(page.querySelector<HTMLTextAreaElement>('#contact-message')!.value).toBe('');
    expect(page.querySelector('.contact-field__counter')!.textContent).toContain('0/1500');
    expect(page.querySelector('.contact-form__notice')).toBeNull();
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(deliveries[1]).not.toBe(delivery);
  });

  it('shows a separate sending dialog and ignores late acceptance after it is cancelled', async () => {
    const page = await openContactPanel();
    const form = page.querySelector<HTMLFormElement>('form')!;
    const delivery = deliveries[0];
    let accept!: () => void;
    const response = new Promise<void>((resolve) => { accept = resolve; });
    delivery.submit.mockImplementation(async () => {
      delivery.phase.set('verifying');
      delivery.pending.set(true);
      await response;
      delivery.pending.set(false);
      delivery.phase.set('idle');
      delivery.sent.set(true);
    });

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    const progress = page.querySelector<HTMLDialogElement>('dialog.submission-progress')!;
    expect(progress.open).toBe(true);
    expect(progress.contains(page.querySelector('.contact-form__verification'))).toBe(true);
    expect(form.contains(page.querySelector('.contact-form__verification'))).toBe(false);
    expect(page.querySelector('.contact-panel')!.getAttribute('aria-busy')).toBe('true');
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);

    progress.querySelector<HTMLButtonElement>('.submission-progress__close')!.click();
    await fixture.whenStable();
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('main')!.hasAttribute('inert')).toBe(false);
    accept();
    await response;
    await fixture.whenStable();
    expect(notifications.show).not.toHaveBeenCalled();
    expect(page.querySelector('form')).toBeNull();
  });

  it('can close during loading and does not reopen when the deferred code finishes later', async () => {
    const page = fixture.nativeElement as HTMLElement;
    const contact = page.querySelector<HTMLButtonElement>('.footer-button--contact')!;
    contact.focus();
    contact.click();
    await fixture.whenStable();
    expect(page.querySelector('app-contact-panel')).toBeNull();
    expect(page.querySelector('main')!.hasAttribute('inert')).toBe(true);

    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Loading);
    await fixture.whenStable();
    const loading = page.querySelector<HTMLElement>('[role="dialog"]')!;
    const close = loading.querySelector<HTMLButtonElement>('.contact-panel__close')!;
    expect(loading.querySelector('[role="status"]')!.textContent).toContain('Loading contact form');
    expect(document.activeElement).toBe(loading);
    loading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(close);
    for (const shiftKey of [false, true]) {
      const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      close.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(close);
    }

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    await fixture.whenStable();
    expect(escape.defaultPrevented).toBe(true);
    expect(page.querySelector('main')!.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(contact);

    await block.render(DeferBlockState.Complete);
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });

  it('provides a focused, closable recovery dialog if the form cannot be loaded', async () => {
    const page = fixture.nativeElement as HTMLElement;
    const contact = page.querySelector<HTMLButtonElement>('.footer-button--contact')!;
    contact.click();
    await fixture.whenStable();
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Error);
    await fixture.whenStable();

    const error = page.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(error.querySelector('[role="alert"]')!.textContent).toContain('could not be loaded');
    expect(error.querySelector('a')!.getAttribute('href')).toBe('/');
    expect(document.activeElement).toBe(error);
    const close = error.querySelector<HTMLButtonElement>('.contact-panel__close')!;
    const reload = error.querySelector<HTMLAnchorElement>('a')!;
    close.focus();
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(reload);
    const forwards = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    reload.dispatchEvent(forwards);
    expect(forwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    close.click();
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(page.querySelector('main')!.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(contact);
  });
});
