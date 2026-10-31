import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  NgZone,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  @ViewChild('pageScroller') private pageScroller?: ElementRef<HTMLElement>;
  @ViewChild('brandTitle') private brandTitle?: ElementRef<HTMLElement>;
  @ViewChild('contactTrigger') private contactTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('contactPanel') private contactPanel?: ElementRef<HTMLElement>;
  @ViewChild('contactFirstField') private contactFirstField?: ElementRef<HTMLInputElement>;

  brandCompact = false;
  updatesExpanded = false;
  contactPanelOpen = false;
  contactMessageLength = 0;
  contactFormNotice = false;

  constructor() {
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => this.observePageScroll());
    });
  }

  private observePageScroll(): void {
    const scroller = this.pageScroller?.nativeElement;
    const title = this.brandTitle?.nativeElement;
    const browser = scroller?.ownerDocument.defaultView;

    if (!scroller || !title || !browser) {
      return;
    }

    let frame: number | null = null;
    let stopped = false;

    const update = (): void => {
      frame = null;

      if (stopped) {
        return;
      }

      // Read geometry once per rendered frame, with no DOM reads needed at the top.
      const shouldCompact =
        scroller.scrollTop > 0 &&
        title.getBoundingClientRect().top <= scroller.getBoundingClientRect().top + 17;

      if (this.brandCompact !== shouldCompact) {
        this.zone.run(() => {
          this.brandCompact = shouldCompact;
          this.changeDetector.markForCheck();
        });
      }
    };

    const scheduleUpdate = (): void => {
      if (frame === null && !stopped) {
        frame = browser.requestAnimationFrame(update);
      }
    };

    scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
    scheduleUpdate();

    this.destroyRef.onDestroy(() => {
      stopped = true;
      scroller.removeEventListener('scroll', scheduleUpdate);

      if (frame !== null) {
        browser.cancelAnimationFrame(frame);
      }
    });
  }

  toggleUpdates(): void {
    this.updatesExpanded = !this.updatesExpanded;
  }

  openContactPanel(): void {
    this.contactPanelOpen = true;
    this.contactFormNotice = false;

    window.setTimeout(() => {
      this.contactFirstField?.nativeElement.focus();
    });
  }

  closeContactPanel(): void {
    this.contactPanelOpen = false;
    this.contactMessageLength = 0;
    this.contactFormNotice = false;

    window.setTimeout(() => {
      this.contactTrigger?.nativeElement.focus();
    });
  }

  trapContactFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const panel = this.contactPanel?.nativeElement;

    if (!panel) {
      return;
    }

    const focusableElements = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('hidden'));

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) {
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  updateContactMessageLength(event: Event): void {
    this.contactMessageLength = (event.target as HTMLTextAreaElement).value.length;
  }

  submitContactForm(event: SubmitEvent): void {
    event.preventDefault();
    this.contactFormNotice = true;
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeContactPanelWithEscape(event: Event): void {
    if (this.contactPanelOpen) {
      event.preventDefault();
      this.closeContactPanel();
    }
  }
}
