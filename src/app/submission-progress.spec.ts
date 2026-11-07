import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormSubmission } from './form-submission';
import { SubmissionProgress } from './submission-progress';

describe('SubmissionProgress', () => {
  let fixture: ComponentFixture<SubmissionProgress>;
  let dialog: HTMLDialogElement;
  let showModal: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let originalShowModal: PropertyDescriptor | undefined;
  let originalClose: PropertyDescriptor | undefined;
  let delivery: {
    pending: ReturnType<typeof signal<boolean>>;
    phase: ReturnType<typeof signal<'idle' | 'verifying' | 'sending'>>;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    const prototype = HTMLDialogElement.prototype;
    originalShowModal = Object.getOwnPropertyDescriptor(prototype, 'showModal');
    originalClose = Object.getOwnPropertyDescriptor(prototype, 'close');
    showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
    close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
    Object.defineProperty(prototype, 'showModal', { configurable: true, value: showModal });
    Object.defineProperty(prototype, 'close', { configurable: true, value: close });
    delivery = { pending: signal(false), phase: signal<'idle' | 'verifying' | 'sending'>('idle') };
    await TestBed.configureTestingModule({
      imports: [SubmissionProgress],
      providers: [{ provide: FormSubmission, useValue: delivery }],
    }).compileComponents();
    fixture = TestBed.createComponent(SubmissionProgress);
    fixture.detectChanges();
    await fixture.whenStable();
    dialog = fixture.nativeElement.querySelector('dialog');
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    const prototype = HTMLDialogElement.prototype;
    if (originalShowModal) Object.defineProperty(prototype, 'showModal', originalShowModal);
    else Reflect.deleteProperty(prototype, 'showModal');
    if (originalClose) Object.defineProperty(prototype, 'close', originalClose);
    else Reflect.deleteProperty(prototype, 'close');
  });

  async function beginSubmission(): Promise<void> {
    delivery.phase.set('verifying');
    delivery.pending.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('opens a focused modal only during submission and closes it when pending ends', async () => {
    const focus = vi.spyOn(dialog, 'focus');
    expect(dialog.open).toBe(false);
    expect(showModal).not.toHaveBeenCalled();
    await beginSubmission();
    expect(dialog.open).toBe(true);
    expect(showModal).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(dialog.textContent).toContain('Preparing your message');

    delivery.phase.set('sending');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.textContent).toContain('Sending your message');
    expect(showModal).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();

    delivery.pending.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the same verification container and widget mounted across progress changes', async () => {
    fixture.componentRef.setInput('kind', 'podcast');
    fixture.detectChanges();
    const container = fixture.componentInstance.verificationContainer.nativeElement;
    const challenge = document.createElement('iframe');
    challenge.title = 'Verification';
    container.append(challenge);
    expect(container.isConnected).toBe(true);
    await beginSubmission();
    expect(dialog.contains(challenge)).toBe(true);
    expect(dialog.textContent).toContain('Preparing your application');
    expect(dialog.getAttribute('aria-labelledby')).toBe('podcast-submission-progress-title');

    delivery.phase.set('sending');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.verificationContainer.nativeElement).toBe(container);
    expect(dialog.contains(challenge)).toBe(true);
    expect(dialog.textContent).toContain('Sending your application');
  });

  it('delegates native cancellation to the parent without a close button', async () => {
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    await beginSubmission();
    const event = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(dialog.querySelector('button')).toBeNull();
  });

  it('closes an active native dialog when the form is destroyed', async () => {
    await beginSubmission();
    fixture.destroy();
    expect(close).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
  });
});
