// Direct visits to these prerendered, read-only pages need only HTML and CSS.
// Their links navigate natively; SPA navigation from Home still uses the original
// lazy Angular routes. Fail closed if a page starts requiring interactive controls.
// Cloudflare may add its own analytics after deployment; it is not in this build.
import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await realpath(join(root, 'dist/syohtimofey/browser'));
const pages = [
  { file: 'privacy/index.html', path: '/privacy/' },
  { file: 'legal/index.html', path: '/legal/' },
  { file: 'podcast/terms/index.html', path: '/podcast/terms/' },
];
const controls = [
  'form', 'button', 'input', 'select', 'textarea', '[contenteditable]',
  '[role="button"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
  '[role="slider"]', '[role="spinbutton"]', '[role="textbox"]', '[role="combobox"]',
  '[role="tab"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
].join(',');
const prepared = [];

for (const page of pages) {
  const target = await realpath(join(output, page.file));
  const local = relative(output, target);
  assert.ok(
    local && !isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`),
    `Information page leaves the browser output: ${page.file}`,
  );
  const html = await readFile(target, 'utf8');
  // No runScripts or resources option: parsing cannot execute scripts or load URLs.
  const dom = new JSDOM(html, { url: `https://syohtimofey.com${page.path}` });
  const document = dom.window.document;

  try {
    assert.equal(
      document.querySelectorAll(controls).length,
      0,
      `${page.path} is no longer read-only; retain its application bootstrap or revise this optimisation.`,
    );
    for (const anchor of document.querySelectorAll('a')) {
      const href = anchor.getAttribute('href')?.trim();
      assert.ok(href, `A link on ${page.path} requires a native href.`);
      assert.ok(
        ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(href, document.baseURI).protocol),
        `A link on ${page.path} requires JavaScript or an unsupported URL scheme: ${href}`,
      );
    }
    for (const element of document.querySelectorAll('[jsaction]')) {
      assert.ok(
        element.localName === 'a' && /^click:\s*;?$/.test(element.getAttribute('jsaction') ?? ''),
        `${page.path} contains an application action that cannot safely become static.`,
      );
    }

    // Angular's critical-CSS loader uses print+onload; activate that same sheet
    // normally when app JavaScript is absent. Retain genuine print-only sheets
    // and existing noscript fallbacks, as well as every inline style and metadata.
    for (const stylesheet of document.querySelectorAll('link[rel~="stylesheet"]')) {
      if (stylesheet.media.trim().toLowerCase() === 'print' && stylesheet.hasAttribute('onload')) {
        stylesheet.removeAttribute('media');
        stylesheet.removeAttribute('onload');
      }
    }
    for (const element of document.querySelectorAll('*')) {
      assert.ok(
        [...element.attributes].every((attribute) => !attribute.name.toLowerCase().startsWith('on')),
        `${page.path} contains an inline application event handler.`,
      );
    }

    let scriptCount = 0;
    for (const script of [...document.scripts]) {
      if (script.type.trim().toLowerCase() === 'application/ld+json') {
        assert.ok(!script.hasAttribute('src'), `JSON-LD must be inline on ${page.path}.`);
        JSON.parse(script.textContent);
      } else {
        script.remove();
        scriptCount += 1;
      }
    }
    const preloads = [...document.querySelectorAll('link[rel~="modulepreload"], link[rel~="preload"][as="script"]')];
    for (const preload of preloads) preload.remove();
    prepared.push({ target, html: dom.serialize(), path: page.path, scriptCount, preloadCount: preloads.length });
  } finally {
    dom.window.close();
  }
}

// Validate all three pages before writing any of them.
for (const page of prepared) {
  await writeFile(page.target, page.html, 'utf8');
  console.log(`Static information page ${page.path}: removed ${page.scriptCount} app scripts and ${page.preloadCount} script preloads.`);
}
