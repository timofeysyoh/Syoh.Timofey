import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  Injector,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-podcast',
  imports: [RouterLink],
  templateUrl: './podcast.html',
  styleUrl: './podcast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Podcast {
  private readonly injector = inject(Injector);
  @ViewChild('applicationTrigger') private applicationTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('applicationDialog') private applicationDialog?: ElementRef<HTMLElement>;
  @ViewChild('applicationFirstField') private applicationFirstField?: ElementRef<HTMLInputElement>;

  // Enable applications only when a real message-delivery transport is connected.
  readonly applicationDeliveryAvailable = false;
  applicationOpen = false;
  messageLength = 0;
  applicationNotice = '';

  openApplication(): void {
    this.applicationOpen = true;
    afterNextRender(() => {
      if (this.applicationOpen) this.applicationFirstField?.nativeElement.focus();
    }, { injector: this.injector });
  }

  closeApplication(): void {
    this.applicationOpen = false;
    this.messageLength = 0;
    this.applicationNotice = '';
    afterNextRender(() => {
      if (!this.applicationOpen) this.applicationTrigger?.nativeElement.focus();
    }, { injector: this.injector });
  }

  trapApplicationFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.applicationDialog?.nativeElement;
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

  @HostListener('document:keydown.escape', ['$event'])
  closeApplicationWithEscape(event: Event): void {
    if (!this.applicationOpen) return;
    event.preventDefault();
    this.closeApplication();
  }

  updateMessageLength(event: Event): void {
    this.messageLength = (event.target as HTMLTextAreaElement).value.length;
  }

  submitApplication(event: Event): void {
    event.preventDefault();
    this.applicationNotice = 'Applications are not open yet. Nothing has been sent.';
  }
}
