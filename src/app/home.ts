import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  Injector,
  NgZone,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContactPanel } from './contact-panel/contact-panel';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ContactPanel],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);

  @ViewChild('pageScroller') private pageScroller?: ElementRef<HTMLElement>;
  @ViewChild('brandTitle') private brandTitle?: ElementRef<HTMLElement>;
  @ViewChild('contactTrigger') private contactTrigger?: ElementRef<HTMLButtonElement>;
  private contactLoadShellPanel?: ElementRef<HTMLElement>;
  @ViewChild('contactLoadShell')
  private set contactLoadShell(panel: ElementRef<HTMLElement> | undefined) {
    this.contactLoadShellPanel = panel;
    if (!panel) return;
    afterNextRender(() => {
      if (this.contactPanelOpen && panel.nativeElement.isConnected) {
        panel.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  brandCompact = false;
  readonly showAdditionalProjects = false;
  updatesExpanded = false;
  contactPanelOpen = false;

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
  }

  closeContactPanel(): void {
    if (!this.contactPanelOpen) return;
    this.contactPanelOpen = false;
    afterNextRender(() => {
      if (!this.contactPanelOpen) this.contactTrigger?.nativeElement.focus();
    }, { injector: this.injector });
  }

  trapContactLoadFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.contactLoadShellPanel?.nativeElement;
    if (!panel) return;
    const elements = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = panel.ownerDocument.activeElement;
    if (!first || !last) return;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === panel)) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeContactPanelWithEscape(event: Event): void {
    if (this.contactPanelOpen) {
      event.preventDefault();
      this.closeContactPanel();
    }
  }
}
