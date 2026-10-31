import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';

describe('Home scroll handling', () => {
  let fixture: ComponentFixture<Home>;
  let scroller: HTMLElement;
  let title: HTMLElement;
  let titleTop: number;
  let callbacks: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  function flushFrame(): void {
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(0);
  }

  beforeEach(async () => {
    callbacks = new Map();
    nextFrame = 0;
    titleTop = 100;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      callbacks.delete(id);
    });

    TestBed.configureTestingModule({ imports: [Home], providers: [provideRouter([])] });
    TestBed.overrideTemplate(
      Home,
      `
      <main #pageScroller>
        <h1 #brandTitle [class.brand-title--compact]="brandCompact">Syoh Timofey</h1>
      </main>
    `,
    );
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await fixture.whenStable();
    scroller = fixture.nativeElement.querySelector('main');
    title = fixture.nativeElement.querySelector('h1');
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => ({ top: 0 }) as DOMRect);
    vi.spyOn(title, 'getBoundingClientRect').mockImplementation(
      () => ({ top: titleTop }) as DOMRect,
    );
    flushFrame();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('coalesces scroll bursts and checks geometry only once per animation frame', () => {
    scroller.scrollTop = 20;
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new Event('scroll'));

    expect(callbacks.size).toBe(1);
    expect(title.getBoundingClientRect).not.toHaveBeenCalled();
    flushFrame();
    expect(title.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(scroller.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.brandCompact).toBe(false);
  });

  it('compacts at the sticky edge and restores the header when returning to the top', async () => {
    scroller.scrollTop = 200;
    titleTop = 16;
    scroller.dispatchEvent(new Event('scroll'));
    flushFrame();
    await fixture.whenStable();
    expect(fixture.componentInstance.brandCompact).toBe(true);
    expect(title.classList.contains('brand-title--compact')).toBe(true);

    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    flushFrame();
    await fixture.whenStable();
    expect(fixture.componentInstance.brandCompact).toBe(false);
    expect(title.classList.contains('brand-title--compact')).toBe(false);
    // Returning to scrollTop 0 short-circuits layout reads.
    expect(title.getBoundingClientRect).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work and removes the listener when the page is destroyed', () => {
    scroller.scrollTop = 200;
    titleTop = 16;
    scroller.dispatchEvent(new Event('scroll'));
    const pending = [...callbacks.values()];
    expect(callbacks.size).toBe(1);

    fixture.destroy();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);

    // A callback already handed to the browser cannot update the destroyed view.
    for (const callback of pending) callback(0);
    scroller.dispatchEvent(new Event('scroll'));
    expect(callbacks.size).toBe(0);
    expect(fixture.componentInstance.brandCompact).toBe(false);
    expect(title.getBoundingClientRect).not.toHaveBeenCalled();
  });
});
