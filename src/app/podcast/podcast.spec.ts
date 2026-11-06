import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Podcast } from './podcast';

describe('Podcast application preview', () => {
  let fixture: ComponentFixture<Podcast>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Podcast],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Podcast);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  async function openApplication(): Promise<HTMLElement> {
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.podcast-primary')!.click();
    await fixture.whenStable();
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
    const privacy = dialog.querySelector<HTMLAnchorElement>('a')!;
    const name = dialog.querySelector<HTMLInputElement>('#podcast-name')!;
    const message = dialog.querySelector<HTMLTextAreaElement>('#podcast-message')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(background.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(name);

    name.value = 'Guest';
    message.value = 'A conversation idea';
    message.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();

    close.focus();
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(privacy);
    const forwards = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    privacy.dispatchEvent(forwards);
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

  it('prevents native submission and explicitly reports that an unavailable application was not sent', async () => {
    const page = await openApplication();
    const form = page.querySelector<HTMLFormElement>('form')!;
    const submit = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);

    // Even a manually dispatched submit must not navigate or leak form values in a GET request.
    const event = new Event('submit', { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Nothing has been sent.');
  });
});
