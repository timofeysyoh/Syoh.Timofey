import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist/syohtimofey/browser');
const origin = 'https://syohtimofey.com';
const routes = [
  {
    file: 'index.html',
    path: '/',
    title: 'Syoh Timofey — Official Website',
    heading: 'Syoh Timofey',
  },
  {
    file: 'privacy/index.html',
    path: '/privacy/',
    title: 'Privacy | Syoh Timofey',
    heading: 'Privacy Policy',
  },
];

async function verifyAsset(reference, baseUrl) {
  const url = new URL(reference, baseUrl);
  if (url.origin !== origin || reference.startsWith('#')) return;

  const asset = resolve(output, `.${decodeURIComponent(url.pathname)}`);
  assert.ok(asset.startsWith(`${output}${sep}`), `Asset leaves the output directory: ${reference}`);
  assert.ok((await stat(asset)).isFile(), `Missing asset: ${reference}`);
}

for (const route of routes) {
  const html = await readFile(join(output, route.file), 'utf8');
  const dom = new JSDOM(html, { url: `${origin}${route.path}` });
  const document = dom.window.document;

  assert.equal(document.title, route.title, `Wrong title in ${route.file}`);
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
  assert.equal(document.querySelector('link[rel="canonical"]').href, `${origin}${route.path}`);
  assert.equal(document.querySelector('meta[property="og:url"]').content, `${origin}${route.path}`);
  assert.equal(
    document.querySelector('meta[property="og:image"]').content,
    `${origin}/share-preview.jpg`,
  );
  assert.equal(
    document.querySelector('meta[name="twitter:image"]').content,
    `${origin}/share-preview.jpg`,
  );
  assert.ok(document.querySelector('meta[name="description"]').content.length > 0);
  assert.ok(
    document.querySelector('h1')?.textContent.includes(route.heading),
    `Route not prerendered: ${route.path}`,
  );

  for (const element of document.querySelectorAll(
    'img[src], script[src], link[rel="stylesheet"][href], link[rel="icon"][href], link[rel="apple-touch-icon"][href]',
  )) {
    await verifyAsset(
      element.getAttribute('src') ?? element.getAttribute('href'),
      document.baseURI,
    );
  }

  for (const element of document.querySelectorAll('[srcset]')) {
    for (const candidate of element.getAttribute('srcset').split(',')) {
      await verifyAsset(candidate.trim().split(/\s+/)[0], document.baseURI);
    }
  }

  if (route.path === '/') {
    assert.equal(
      document.querySelectorAll('feTurbulence, feSpecularLighting').length,
      0,
      'Full-page SVG noise/lighting must be prerasterized, not rendered on the phone.',
    );
    let decorationBytes = 0;
    for (const decoration of document.querySelectorAll('.media-card__decoration')) {
      assert.equal(decoration.getAttribute('loading'), 'lazy');
      assert.equal(decoration.getAttribute('decoding'), 'async');
      assert.ok(decoration.hasAttribute('width') && decoration.hasAttribute('height'));
      const source = decoration.getAttribute('src');
      assert.ok(source.endsWith('.webp'), `Decoration must use its optimized asset: ${source}`);
      decorationBytes += (await stat(resolve(output, `.${source}`))).size;
    }
    assert.ok(
      decorationBytes <= 80 * 1024,
      `Decorations exceed the 80 KiB mobile budget: ${decorationBytes} bytes.`,
    );
    assert.equal(
      document.querySelectorAll('link[href*="fonts.googleapis.com"]').length,
      0,
      'A third-party font stylesheet must not block the first render.',
    );
    const person = JSON.parse(
      document.querySelector('script[type="application/ld+json"]').textContent,
    );
    assert.equal(person.url, `${origin}/`);
    for (const platform of ['Instagram', 'X', 'Twitch']) {
      assert.ok(
        document
          .querySelector(`.media-card__link[aria-label="${platform}"]`)
          ?.hasAttribute('hidden'),
      );
    }
    for (const platform of ['YouTube', 'TikTok', 'Telegram']) {
      assert.equal(
        document
          .querySelector(`.media-card__link[aria-label="${platform}"]`)
          ?.hasAttribute('hidden'),
        false,
      );
    }
  }

  dom.window.close();
  console.log(`Verified prerendered route ${route.path} and its assets.`);
}

const robots = await readFile(join(output, 'robots.txt'), 'utf8');
assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
const sitemap = new JSDOM(await readFile(join(output, 'sitemap.xml'), 'utf8'), {
  contentType: 'text/xml',
});
assert.deepEqual(
  [...sitemap.window.document.querySelectorAll('loc')].map((element) => element.textContent),
  routes.map((route) => `${origin}${route.path}`),
);
sitemap.window.close();

const notFound = new JSDOM(await readFile(join(output, '404.html'), 'utf8'));
assert.ok(
  notFound.window.document.querySelector('meta[name="robots"]')?.content.includes('noindex'),
);
assert.equal(notFound.window.document.querySelector('a')?.getAttribute('href'), '/');
notFound.window.close();
assert.ok(
  (await readFile(join(output, '_headers'), 'utf8')).includes('X-Content-Type-Options: nosniff'),
);

async function verifyFileLimits(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) count += await verifyFileLimits(path);
    else {
      assert.ok(
        (await stat(path)).size <= 25 * 1024 * 1024,
        `File exceeds the Pages 25 MiB limit: ${relative(output, path)}`,
      );
      count += 1;
    }
  }
  return count;
}

const fileCount = await verifyFileLimits(output);
assert.ok(fileCount <= 1000, `The dashboard upload limit is 1000 files; found ${fileCount}.`);
const angular = JSON.parse(await readFile(join(root, 'angular.json'), 'utf8'));
assert.equal(angular.projects.syohtimofey.architect.build.options.outputMode, 'static');
console.log(`Cloudflare Pages bundle ready: ${fileCount} files in ${relative(root, output)}.`);
