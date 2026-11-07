import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  output,
  ViewChild,
} from '@angular/core';
import { ResizableMessage } from '../resizable-message.directive';
import { FormSubmission } from '../form-submission';
import { SubmissionNotificationService } from '../submission-notification';
import { SubmissionProgress } from '../submission-progress';

@Component({
  selector: 'app-contact-panel',
  imports: [ResizableMessage, SubmissionProgress],
  providers: [FormSubmission],
  templateUrl: './contact-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPanel {
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly notifications = inject(SubmissionNotificationService);
  @ViewChild('contactPanel') private contactPanel?: ElementRef<HTMLElement>;
  @ViewChild('contactFirstField') private contactFirstField?: ElementRef<HTMLInputElement>;
  @ViewChild('submissionProgress') private submissionProgress?: SubmissionProgress;

  readonly closed = output<void>();
  readonly delivery = inject(FormSubmission);
  contactMessageLength = 0;

  constructor() {
    afterNextRender(() => this.contactFirstField?.nativeElement.focus());
  }

  closeContactPanel(): void {
    this.closed.emit();
  }

  trapContactFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.contactPanel?.nativeElement;
    if (!panel) return;

    const elements = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden'));
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = panel.ownerDocument.activeElement;
    if (!first || !last) return;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  updateContactMessageLength(event: Event): void {
    this.contactMessageLength = (event.target as HTMLTextAreaElement).value.length;
  }

  async submitContactForm(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!this.submissionProgress || this.delivery.pending() || this.delivery.sent()) return;
    const form = event.target as HTMLFormElement;
    await this.delivery.submit(form, 'contact', this.submissionProgress.verificationContainer.nativeElement);
    if (this.destroyRef.destroyed) return;

    if (this.delivery.sent()) {
      this.notifications.show('contact');
      this.closed.emit();
    } else if (this.delivery.error()) {
      afterNextRender(() => {
        if (this.destroyRef.destroyed || !form.isConnected) return;
        form.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus({ preventScroll: true });
        form.querySelector<HTMLElement>('.contact-form__notice')?.scrollIntoView?.({ block: 'nearest' });
      }, { injector: this.injector });
    }
  }
}
