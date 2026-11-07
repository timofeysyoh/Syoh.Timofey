import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResizableMessage } from './resizable-message.directive';

@Component({
  imports: [ResizableMessage],
  template: `
    <div class="contact-panel-backdrop" style="padding: 16px">
      <section class="contact-panel" style="max-height: 600px; padding-bottom: 16px; border-bottom: 1px solid">
        <form><textarea appResizableMessage style="height: 124px; min-height: 124px"></textarea></form>
      </section>
    </div>
  `,
})
class ResizeHost {}

describe('Resizable message space', () => {
  let fixture: ComponentFixture<ResizeHost> | undefined;
  let textarea: HTMLTextAreaElement;
  let areaHeight: number;
  let fixedHeight: number;
  let geometryReads: number;
  let nextFrame: number;
  let frames: Map<number, FrameRequestCallback>;
  let notifyResize: () => void;
  let disconnect: ReturnType<typeof vi.fn>;
  let viewport: EventTarget & { height: number };
  let viewportDescriptor: PropertyDescriptor | undefined;

  function flushFrame(): void {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  }

  async function createForm(): Promise<void> {
    fixture = TestBed.createComponent(ResizeHost);
    fixture.detectChanges();
    await fixture.whenStable();
    textarea = fixture.nativeElement.querySelector('textarea');
  }

  beforeEach(async () => {
    areaHeight = 124;
    fixedHeight = 300;
    geometryReads = 0;
    nextFrame = 0;
    frames = new Map();
    disconnect = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
      frames.delete(frame);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      geometryReads++;
      if (this.tagName === 'TEXTAREA') return { height: areaHeight } as DOMRect;
      if (this.tagName === 'FORM') {
        // The panel's bottom padding and border are outside the form.
        return { bottom: 20 + fixedHeight + areaHeight - 17 } as DOMRect;
      }
      return { top: 20 } as DOMRect;
    });
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as unknown as ResizeObserver);
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnect;
    });
    viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    viewport = Object.assign(new window.EventTarget(), { height: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    await TestBed.configureTestingModule({ imports: [ResizeHost] }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (viewportDescriptor) Object.defineProperty(window, 'visualViewport', viewportDescriptor);
    else Reflect.deleteProperty(window, 'visualViewport');
  });

  it('lets the textarea grow without consuming the space needed by the rest of the form', async () => {
    await createForm();
    expect(textarea.style.getPropertyValue('--message-max-height')).toBe('300px');

    areaHeight = 240;
    notifyResize();
    flushFrame();
    expect(textarea.style.getPropertyValue('--message-max-height')).toBe('300px');

    fixedHeight = 350;
    geometryReads = 0;
    notifyResize();
    notifyResize();
    notifyResize();
    expect(frames.size).toBe(1);
    expect(geometryReads).toBe(0);
    flushFrame();
    expect(textarea.style.getPropertyValue('--message-max-height')).toBe('250px');
  });

  it('does not schedule layout measurements while typing into a fixed-height textarea', async () => {
    await createForm();
    geometryReads = 0;
    for (let index = 0; index < 20; index++) {
      textarea.value += 'a';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(frames.size).toBe(0);
    expect(geometryReads).toBe(0);
  });

  it('recalculates the resize budget when the visible viewport shrinks and expands', async () => {
    await createForm();
    viewport.height = 532;
    viewport.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(textarea.style.getPropertyValue('--message-max-height')).toBe('200px');

    viewport.height = 360;
    viewport.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(textarea.style.getPropertyValue('--message-max-height')).toBe('124px');

    viewport.height = 800;
    viewport.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(textarea.style.getPropertyValue('--message-max-height')).toBe('300px');
  });

  it('disconnects observers and ignores pending work when the form closes', async () => {
    await createForm();
    notifyResize();
    const pending = [...frames.values()];
    expect(frames.size).toBe(1);
    fixture!.destroy();
    fixture = undefined;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);

    geometryReads = 0;
    for (const callback of pending) callback(0);
    notifyResize();
    viewport.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(0);
    expect(geometryReads).toBe(0);
  });

  it('still updates after manual resizing when ResizeObserver is unavailable', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    await createForm();
    fixedHeight = 350;
    textarea.dispatchEvent(new Event('pointerup'));
    flushFrame();
    expect(textarea.style.getPropertyValue('--message-max-height')).toBe('250px');
  });
});
