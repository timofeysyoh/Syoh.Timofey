import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Podcast } from './podcast';
import { PodcastApplication } from './application/podcast-application';
import { FormSubmission } from '../form-submission';

describe('Podcast application', () => {
  let fixture: ComponentFixture<Podcast>;
  let deliveries: ReturnType<typeof createDeliveryMock>[];

  function createDeliveryMock() {
    return {
      pending: signal(false),
      sent: signal(false),
      notice: signal(''),
      error: signal(false),
      submit: vi.fn(async (_form: HTMLFormElement, _kind: string, _container: HTMLElement) => {}),
    };
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    deliveries = [];
    TestBed.overrideComponent(PodcastApplication, {
      set: { providers: [{ provide: FormSubmission, useFactory: () => {
        const delivery = createDeliveryMock();
        deliveries.push(delivery);
        return delivery;
      } }] },
    });
    await TestBed.configureTestingModule({
      imports: [Podcast],
      providers: [provideRouter([])],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    }).compileComponents();
    fixture = TestBed.createComponent(Podcast);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  async function openApplication(): Promise<HTMLElement> {
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.podcast-primary')!.click();
    await fixture.whenStable();
    if (!page.querySelector('.podcast-application')) {
      const [block] = await fixture.getDeferBlocks();
      await block.render(DeferBlockState.Complete);
      await fixture.whenStable();
    }
    return page;
  }

  it('opens an accessible dialog, traps focus, restores the trigger and clears a closed application', async () => {
    const page = fixture.nativeElement as HTMLElement;
    const trigger = page.querySelector<HTMLButtonElement>('.podcast-primary')!;
    const background = page.querySelector('main')!;
    expect(page.querySelector('form')).toBeNull();

    await openApplication();
    const dialog = page.querySelector<HTMLElement>('[role="dialog"]')!;
    const close = dialog.querySelector<HTMLButtonElement>('.podcast-dialog-close')!;
    const send = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const name = dialog.querySelector<HTMLInputElement>('#podcast-name')!;
    const message = dialog.querySelector<HTMLTextAreaElement>('#podcast-message')!;
    const consent = dialog.querySelector<HTMLInputElement>('#podcast-consent')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(background.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(name);

    name.value = 'Guest';
    consent.checked = true;
    message.value = 'A conversation idea';
    message.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();

    close.focus();
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(send);
    const forwards = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    send.dispatchEvent(forwards);
    expect(forwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    await fixture.whenStable();
    expect(escape.defaultPrevented).toBe(true);
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(background.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(trigger);

    await openApplication();
    expect(page.querySelector<HTMLInputElement>('#podcast-name')!.value).toBe('');
    expect(page.querySelector<HTMLTextAreaElement>('#podcast-message')!.value).toBe('');
    expect(page.querySelector<HTMLInputElement>('#podcast-consent')!.checked).toBe(false);
    expect(page.querySelector('#podcast-message-count')!.textContent).toContain('0/1500');

    // Native resize/focus gestures inside the dialog must not be cancelled by its backdrop.
    const inside = new Event('pointerdown', { bubbles: true, cancelable: true });
    page.querySelector('#podcast-message')!.dispatchEvent(inside);
    expect(inside.defaultPrevented).toBe(false);
    const backdrop = page.querySelector('.podcast-dialog-backdrop')!;
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).not.toBeNull();
    backdrop.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });

  it('delegates delivery, disables pending and sent submissions, and displays recoverable delivery errors', async () => {
    const page = await openApplication();
    const form = page.querySelector<HTMLFormElement>('form')!;
    const submit = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const delivery = deliveries[0];
    expect(submit.disabled).toBe(false);
    delivery.submit.mockImplementation(async () => {
      delivery.pending.set(true);
      delivery.notice.set('Sending your application…');
    });

    // Even a manually dispatched submit must not leak values in a native GET request.
    const event = new Event('submit', { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(delivery.submit).toHaveBeenCalledWith(form, 'podcast', page.querySelector('.contact-form__verification'));
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute('aria-busy')).toBe('true');
    expect(submit.textContent).toContain('Sending');

    delivery.pending.set(false);
    delivery.error.set(true);
    delivery.notice.set('We could not confirm delivery. Please try again.');
    await fixture.whenStable();
    expect(submit.disabled).toBe(false);
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('try again');

    delivery.submit.mockImplementation(async () => {
      delivery.error.set(false);
      delivery.sent.set(true);
      delivery.notice.set('Your application has been sent.');
    });
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toContain('Application sent');
    expect(page.querySelector('[role="status"]')?.textContent).toContain('has been sent');
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it('requires an unchecked acknowledgement and lets the guest read terms without replacing the application', async () => {
    const page = await openApplication();
    const form = page.querySelector<HTMLFormElement>('form')!;
    page.querySelector<HTMLInputElement>('#podcast-name')!.value = 'Guest';
    page.querySelector<HTMLInputElement>('#podcast-email')!.value = 'guest@example.com';
    page.querySelector<HTMLSelectElement>('#podcast-interest')!.value = 'guest';
    page.querySelector<HTMLInputElement>('#podcast-social-profile')!.value = '@guest';
    page.querySelector<HTMLTextAreaElement>('#podcast-message')!.value = 'A conversation about creating music.';

    const consent = page.querySelector<HTMLInputElement>('#podcast-consent')!;
    expect(consent.checked).toBe(false);
    expect(consent.validity.valueMissing).toBe(true);
    expect(form.checkValidity()).toBe(false);
    consent.checked = true;
    expect(form.checkValidity()).toBe(true);

    const terms = page.querySelector<HTMLAnchorElement>('.contact-consent a')!;
    expect(new URL(terms.href).pathname).toMatch(/^\/podcast\/terms\/?$/);
    expect(terms.target).toBe('_blank');
    expect(terms.relList.contains('noopener')).toBe(true);
  });

  it('changes the social network without losing the username or submitting, and resets a closed application', async () => {
    const page = await openApplication();
    const profile = page.querySelector<HTMLInputElement>('#podcast-social-profile')!;
    const trigger = page.querySelector<HTMLButtonElement>('#podcast-social-network')!;
    const form = page.querySelector<HTMLFormElement>('form')!;
    let submissions = 0;
    form.addEventListener('submit', () => submissions++);
    profile.value = '@creative_guest';
    profile.dispatchEvent(new Event('input', { bubbles: true }));

    trigger.click();
    await fixture.whenStable();
    const options = Array.from(page.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(options.map((option) => option.textContent?.trim())).toEqual(['YouTube', 'Instagram', 'TikTok']);
    options[1].click();
    await fixture.whenStable();

    expect(profile.value).toBe('@creative_guest');
    expect(trigger.getAttribute('aria-label')).toContain('Instagram');
    expect(trigger.querySelector('img')!.getAttribute('src')).toBe('/instagram-2016-logo-svgrepo-com.svg');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(submissions).toBe(0);
    const data = new window.FormData(form);
    expect(data.get('socialProfile')).toBe('@creative_guest');
    expect(data.get('socialNetwork')).toBe('instagram');

    trigger.click();
    await fixture.whenStable();
    const selected = page.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')!;
    expect(selected.textContent).toContain('Instagram');
    expect(document.activeElement).toBe(selected);
    page.querySelector<HTMLButtonElement>('.podcast-dialog-close')!.click();
    await fixture.whenStable();
    await openApplication();
    expect(page.querySelector<HTMLInputElement>('#podcast-social-profile')!.value).toBe('');
    expect(page.querySelector('#podcast-social-network')!.getAttribute('aria-label')).toContain('YouTube');
    expect(page.querySelector('[role="menu"]')).toBeNull();
    expect(new window.FormData(page.querySelector<HTMLFormElement>('form')!).get('socialNetwork')).toBe('youtube');
  });

  it('navigates social options with the keyboard and dismisses the menu before the dialog with Escape', async () => {
    const page = await openApplication();
    const trigger = page.querySelector<HTMLButtonElement>('#podcast-social-network')!;
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    const options = Array.from(page.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(document.activeElement).toBe(options[0]);

    for (const [key, expected] of [['ArrowDown', 1], ['End', 2], ['Home', 0], ['ArrowUp', 2]] as const) {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(options[expected]);
    }
    // Enter/Space activation of these native buttons is exercised in browser QA;
    // jsdom does not synthesize their default click from a dispatched key event.
    (document.activeElement as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-label')).toContain('TikTok');

    trigger.click();
    await fixture.whenStable();
    const menuEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(menuEscape);
    await fixture.whenStable();
    expect(menuEscape.defaultPrevented).toBe(true);
    expect(page.querySelector('[role="menu"]')).toBeNull();
    expect(page.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(page.querySelector('.podcast-primary'));
  });

  it('leaves the social menu in either Tab direction and dismisses outside without cancelling normal pointer actions', async () => {
    const page = await openApplication();
    const trigger = page.querySelector<HTMLButtonElement>('#podcast-social-network')!;
    const profile = page.querySelector<HTMLInputElement>('#podcast-social-profile')!;
    const message = page.querySelector<HTMLTextAreaElement>('#podcast-message')!;

    for (const shiftKey of [false, true]) {
      trigger.click();
      await fixture.whenStable();
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', shiftKey, bubbles: true, cancelable: true,
      }));
      await fixture.whenStable();
      expect(page.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(shiftKey ? profile : message);
      expect(page.querySelector('[role="dialog"]')).not.toBeNull();
    }

    trigger.click();
    await fixture.whenStable();
    const pointer = new Event('pointerdown', { bubbles: true, cancelable: true });
    message.dispatchEvent(pointer);
    await fixture.whenStable();
    expect(pointer.defaultPrevented).toBe(false);
    expect(page.querySelector('[role="menu"]')).toBeNull();
    expect(page.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('can close pending and failed form loading without leaving the page inert', async () => {
    const page = fixture.nativeElement as HTMLElement;
    const trigger = page.querySelector<HTMLButtonElement>('.podcast-primary')!;
    const background = page.querySelector('main')!;
    trigger.click();
    await fixture.whenStable();
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Loading);
    await fixture.whenStable();

    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(background.hasAttribute('inert')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));
    await fixture.whenStable();
    expect(background.hasAttribute('inert')).toBe(false);
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    await fixture.whenStable();
    await block.render(DeferBlockState.Error);
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    const reload = page.querySelector<HTMLAnchorElement>('[role="alert"] a')!;
    expect(reload.getAttribute('href')).toBe('/podcast/');
    const close = page.querySelector<HTMLButtonElement>('.podcast-dialog-close')!;
    expect(document.activeElement).toBe(close);
    const backwards = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    close.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(reload);
    close.click();
    await fixture.whenStable();
    expect(background.hasAttribute('inert')).toBe(false);
    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });
});
