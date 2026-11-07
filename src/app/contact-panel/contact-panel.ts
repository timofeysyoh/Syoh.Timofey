import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  ViewChild,
} from '@angular/core';
import { ResizableMessage } from '../resizable-message.directive';
import { FormSubmission } from '../form-submission';

@Component({
  selector: 'app-contact-panel',
  imports: [ResizableMessage],
  providers: [FormSubmission],
  templateUrl: './contact-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPanel {
  @ViewChild('contactPanel') private contactPanel?: ElementRef<HTMLElement>;
  @ViewChild('contactFirstField') private contactFirstField?: ElementRef<HTMLInputElement>;
  @ViewChild('verificationContainer') private verificationContainer?: ElementRef<HTMLElement>;

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

  submitContactForm(event: SubmitEvent): void {
    event.preventDefault();
    if (this.verificationContainer) {
      void this.delivery.submit(event.target as HTMLFormElement, 'contact', this.verificationContainer.nativeElement);
    }
  }
}
