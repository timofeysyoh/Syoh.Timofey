import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist/syohtimofey/browser');
const origin = 'https://syohtimofey.com';
const staticInformationPaths = new Set(['/privacy/', '/legal/', '/podcast/terms/']);
const routes = [
  {
    file: 'index.html',
    path: '/',
    title: 'Syoh Timofey — Official Website',
    heading: 'Syoh Timofey',
  },
  {
    file: 'podcast/index.html',
    path: '/podcast/',
    title: 'Podcast | Syoh Timofey',
    heading: 'Podcast',
  },
  {
    file: 'privacy/index.html',
    path: '/privacy/',
    title: 'Privacy | Syoh Timofey',
    heading: 'Privacy Policy',
  },
  {
    file: 'podcast/terms/index.html',
    path: '/podcast/terms/',
    title: 'Podcast Terms | Syoh Timofey',
    heading: 'Podcast Terms',
  },
  {
    file: 'legal/index.html',
    path: '/legal/',
    title: 'Legal Notice | Syoh Timofey',
    heading: 'Legal Notice',
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

  if (staticInformationPaths.has(route.path)) {
    assert.equal(
      [...document.scripts].filter((script) => script.type.trim().toLowerCase() !== 'application/ld+json').length,
      0,
      `Read-only information page must not download or execute app JavaScript: ${route.path}`,
    );
    assert.equal(document.querySelectorAll('link[rel~="modulepreload"], link[rel~="preload"][as="script"]').length, 0);
    assert.equal(
      document.querySelectorAll('form, button, input, select, textarea, [contenteditable]').length,
      0,
      `Interactive controls need application JavaScript: ${route.path}`,
    );
    for (const anchor of document.querySelectorAll('a')) {
      const href = anchor.getAttribute('href')?.trim();
      assert.ok(href, `Read-only page link lacks a native href: ${route.path}`);
      assert.ok(['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(href, document.baseURI).protocol));
    }
    for (const stylesheet of document.querySelectorAll('link[rel~="stylesheet"]')) {
      assert.equal(stylesheet.hasAttribute('onload'), false, `CSS must load without app JavaScript: ${route.path}`);
    }
  }

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
    assert.match(
      document.querySelector('.media-card-wrap--podcast a')?.getAttribute('href') ?? '',
      /^\/podcast\/?$/,
      'The Podcast card must open the internal podcast page.',
    );
    for (const platform of ['X', 'Twitch']) {
      assert.ok(
        document
          .querySelector(`.media-card__link[aria-label="${platform}"]`)
          ?.hasAttribute('hidden'),
      );
    }
    for (const platform of ['Instagram', 'YouTube', 'TikTok', 'Telegram']) {
      assert.equal(
        document
          .querySelector(`.media-card__link[aria-label="${platform}"]`)
          ?.hasAttribute('hidden'),
        false,
      );
    }
    for (const element of document.querySelectorAll(
      '.media-card-wrap--business, .media-card-wrap--crypto, .notification-card--middle, .notification-card--bottom',
    )) {
      assert.ok(
        element.closest('[hidden]'),
        'Temporarily hidden projects and their news must not appear in the public page.',
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
const headers = await readFile(join(output, '_headers'), 'utf8');
const globalHeaderBlock = headers.match(/^\/\*\r?\n((?:[ \t]+[^\r\n]*(?:\r?\n|$))*)/m)?.[1] ?? '';
const globalHeaders = new Map(
  globalHeaderBlock.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf(':');
    return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
  }),
);
assert.equal(globalHeaders.get('x-content-type-options'), 'nosniff');
const contentSecurityPolicy = globalHeaders.get('content-security-policy') ?? '';
for (const [directive, value] of [
  ['object-src', "'none'"],
  ['base-uri', "'self'"],
  ['frame-ancestors', "'none'"],
  ['form-action', "'self'"],
]) {
  assert.match(
    contentSecurityPolicy,
    new RegExp(`(?:^|;)\\s*${directive}\\s+${value}\\s*(?:;|$)`, 'i'),
    `Missing global Content-Security-Policy directive: ${directive} ${value}`,
  );
}
const strictTransportSecurity = globalHeaders.get('strict-transport-security') ?? '';
assert.match(strictTransportSecurity, /(?:^|;)\s*max-age\s*=\s*15552000\s*(?:;|$)/i);
assert.doesNotMatch(strictTransportSecurity, /(?:^|;)\s*(?:includesubdomains|preload)\s*(?:;|$)/i);
const functionRoutes = JSON.parse(await readFile(join(output, '_routes.json'), 'utf8'));
assert.deepEqual(functionRoutes, { version: 1, include: ['/api/*'], exclude: [] });
for (const endpoint of ['functions/api/forms.ts', 'functions/api/forms/config.ts']) {
  assert.ok((await stat(join(root, endpoint))).isFile(), `Missing Pages Function: ${endpoint}`);
}

async function verifyFileLimits(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = entry.name.toLowerCase();
    // Catch accidental private/source paths; file contents still need separate review.
    const privateDirectory = ['.git', '.wrangler', 'node_modules'].includes(name);
    const privateOrSourceFile = /^(?:\.env|\.dev\.vars)/.test(name)
      || name === '.npmrc'
      || /\.(?:pem|key|p12|pfx|ts|map)$/.test(name);
    assert.ok(
      !privateDirectory && !privateOrSourceFile,
      `Private or source artifact must not be deployed: ${relative(output, path)}`,
    );
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
