import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './app.html'
})
export class Home {
  @ViewChild('brandTitle') private brandTitle?: ElementRef<HTMLElement>;
  @ViewChild('contactTrigger') private contactTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('contactPanel') private contactPanel?: ElementRef<HTMLElement>;
  @ViewChild('contactFirstField') private contactFirstField?: ElementRef<HTMLInputElement>;

  brandCompact = false;
  updatesExpanded = false;
  contactPanelOpen = false;
  contactMessageLength = 0;
  contactFormNotice = false;

  onPageScroll(event: Event): void {
    const scroller = event.currentTarget as HTMLElement | null;
    const title = this.brandTitle?.nativeElement;

    if (!scroller || !title) {
      return;
    }

    const stickyEdge = scroller.getBoundingClientRect().top + 17;
    const shouldCompact = scroller.scrollTop > 0 && title.getBoundingClientRect().top <= stickyEdge;

    if (this.brandCompact !== shouldCompact) {
      this.brandCompact = shouldCompact;
    }
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
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
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
