import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  NgZone,
} from '@angular/core';

@Directive({
  selector: 'textarea[appResizableMessage]',
  standalone: true,
})
export class ResizableMessage {
  private readonly element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  constructor() {
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => this.observeAvailableSpace());
    });
  }

  private observeAvailableSpace(): void {
    const textarea = this.element.nativeElement;
    const panel = textarea.closest<HTMLElement>('.contact-panel');
    const backdrop = panel?.closest<HTMLElement>('.contact-panel-backdrop');
    const form = textarea.closest('form');
    const browser = textarea.ownerDocument.defaultView;
    if (!panel || !form || !browser) return;

    let frame: number | null = null;
    let stopped = false;
    let previousMaximum = '';

    const update = (): void => {
      frame = null;
      if (stopped) return;

      const panelStyle = browser.getComputedStyle(panel);
      const textareaStyle = browser.getComputedStyle(textarea);
      const cssMaximum = Number.parseFloat(panelStyle.maxHeight);
      if (!Number.isFinite(cssMaximum)) return;
      const backdropStyle = backdrop ? browser.getComputedStyle(backdrop) : null;
      const viewportInsets = (Number.parseFloat(backdropStyle?.paddingTop ?? '') || 0) +
        (Number.parseFloat(backdropStyle?.paddingBottom ?? '') || 0);
      const visibleHeight = browser.visualViewport?.height ?? browser.innerHeight;
      const panelMaximum = Math.min(cssMaximum, Math.max(0, visibleHeight - viewportInsets));

      // Measure the form's natural bottom even when the dialog is already scrolling.
      const contentHeight = form.getBoundingClientRect().bottom -
        panel.getBoundingClientRect().top + panel.scrollTop +
        (Number.parseFloat(panelStyle.paddingBottom) || 0) +
        (Number.parseFloat(panelStyle.borderBottomWidth) || 0);
      const fixedHeight = Math.max(0, contentHeight - textarea.getBoundingClientRect().height);
      const minimum = Number.parseFloat(textareaStyle.minHeight) || 0;
      const maximum = `${Math.max(minimum, Math.floor(panelMaximum - fixedHeight))}px`;

      if (maximum !== previousMaximum) {
        previousMaximum = maximum;
        textarea.style.setProperty('--message-max-height', maximum);
      }
    };

    const scheduleUpdate = (): void => {
      if (frame === null && !stopped) frame = browser.requestAnimationFrame(update);
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    update();
    observer?.observe(panel);
    observer?.observe(form);
    browser.addEventListener('resize', scheduleUpdate, { passive: true });
    browser.visualViewport?.addEventListener('resize', scheduleUpdate, { passive: true });
    // Typing does not resize this fixed-height control. ResizeObserver covers
    // layout changes without forcing geometry reads for every keystroke.
    if (!observer) textarea.addEventListener('pointerup', scheduleUpdate, { passive: true });

    this.destroyRef.onDestroy(() => {
      stopped = true;
      observer?.disconnect();
      browser.removeEventListener('resize', scheduleUpdate);
      browser.visualViewport?.removeEventListener('resize', scheduleUpdate);
      textarea.removeEventListener('pointerup', scheduleUpdate);
      if (frame !== null) browser.cancelAnimationFrame(frame);
    });
  }
}
