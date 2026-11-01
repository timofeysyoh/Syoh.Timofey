import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Podcast } from './podcast';

describe('Podcast application preview', () => {
  let fixture: ComponentFixture<Podcast>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Podcast],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Podcast);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('prevents native submission and explicitly reports that an unavailable application was not sent', async () => {
    const page = fixture.nativeElement as HTMLElement;
    const form = page.querySelector<HTMLFormElement>('form')!;
    const submit = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);

    // Even a manually dispatched submit must not navigate or leak form values in a GET request.
    const event = new Event('submit', { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Nothing has been sent.');
  });
});
