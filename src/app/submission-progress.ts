import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  ViewChild,
} from '@angular/core';
import { FormSubmission } from './form-submission';

@Component({
  selector: 'app-submission-progress',
  templateUrl: './submission-progress.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubmissionProgress {
  readonly delivery = inject(FormSubmission);
  readonly kind = input<'contact' | 'podcast'>('contact');
  readonly cancelled = output<void>();
  readonly titleId = computed(() => `${this.kind()}-submission-progress-title`);
  readonly descriptionId = computed(() => `${this.kind()}-submission-progress-description`);
  readonly title = computed(() => {
    const action = this.delivery.phase() === 'sending' ? 'Sending' : 'Preparing';
    return `${action} your ${this.kind() === 'podcast' ? 'application' : 'message'}…`;
  });

  // This container stays mounted before submission, so the form can pass a real
  // element to Turnstile without waiting for a second conditional view.
  @ViewChild('verificationContainer', { static: true })
  verificationContainer!: ElementRef<HTMLElement>;
  @ViewChild('progressDialog', { static: true })
  private progressDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('cancelButton', { static: true })
  private cancelButton!: ElementRef<HTMLButtonElement>;

  constructor() {
    afterRenderEffect(() => {
      const pending = this.delivery.pending();
      const dialog = this.progressDialog.nativeElement;
      if (!dialog.isConnected) return;

      if (pending && !dialog.open) {
        // The top layer keeps the spinner and any interactive Turnstile
        // challenge accessible while the form behind it becomes inert.
        dialog.showModal();
        this.cancelButton.nativeElement.focus({ preventScroll: true });
      } else if (!pending && dialog.open) {
        dialog.close();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      const dialog = this.progressDialog?.nativeElement;
      if (dialog?.open) dialog.close();
    });
  }

  cancel(event?: Event): void {
    event?.preventDefault();
    this.cancelled.emit();
  }
}
