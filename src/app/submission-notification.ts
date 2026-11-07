import { ChangeDetectionStrategy, Component, DestroyRef, Injectable, inject, signal } from '@angular/core';

type SubmissionKind = 'contact' | 'podcast';

@Injectable({ providedIn: 'root' })
export class SubmissionNotificationService {
  readonly kind = signal<SubmissionKind | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  show(kind: SubmissionKind): void {
    this.clearTimer();
    this.kind.set(kind);
    this.timer = setTimeout(() => this.dismiss(), 4_000);
  }

  dismiss(): void {
    this.clearTimer();
    this.kind.set(null);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

@Component({
  selector: 'app-submission-notification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="status" aria-live="polite" aria-atomic="true">
      @if (notification.kind(); as kind) {
        <aside class="submission-toast">
          <span class="submission-toast__check" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8" /></svg>
          </span>
          <p>{{ kind === 'podcast' ? 'Application sent' : 'Message sent' }}</p>
        </aside>
      }
    </div>
  `,
})
export class SubmissionNotification {
  readonly notification = inject(SubmissionNotificationService);
}
