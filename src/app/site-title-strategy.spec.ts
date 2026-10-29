import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, TitleStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SiteTitleStrategy } from './site-title-strategy';

@Component({ template: '' })
class TestPage {}

describe('SiteTitleStrategy', () => {
  it('updates canonical and social metadata when navigating between pages', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: TestPage,
            title: 'Syoh Timofey — Official Website',
            data: { canonicalPath: '/', description: 'Home description' },
          },
          {
            path: 'privacy',
            component: TestPage,
            title: 'Privacy | Syoh Timofey',
            data: { canonicalPath: '/privacy/', description: 'Privacy description' },
          },
        ]),
        { provide: TitleStrategy, useClass: SiteTitleStrategy },
      ],
    });

    const harness = await RouterTestingHarness.create();
    const document = TestBed.inject(DOCUMENT);

    await harness.navigateByUrl('/privacy?ref=launch#contact');
    expect(document.title).toBe('Privacy | Syoh Timofey');
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      'https://syohtimofey.com/privacy/',
    );
    expect(document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content).toBe(
      'https://syohtimofey.com/privacy/',
    );
    expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe(
      'Privacy description',
    );

    await harness.navigateByUrl('/');
    expect(document.title).toBe('Syoh Timofey — Official Website');
    expect(document.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      'https://syohtimofey.com/',
    );
    expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe(
      'Home description',
    );
    expect(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content).toBe(
      'Syoh Timofey — Official Website',
    );
    expect(document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content).toBe(
      'Syoh Timofey — Official Website',
    );
  });
});
