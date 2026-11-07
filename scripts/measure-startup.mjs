// Read-only size report for the home page's declared startup resources.
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const directory = resolve(process.argv[2] ?? 'dist/syohtimofey/browser');
const html = await readFile(resolve(directory, 'index.html'));
const dom = new JSDOM(html.toString());
const document = dom.window.document;
const sizes = (body) => ({
  raw: body.length,
  gzip: gzipSync(body).length,
  brotli: brotliCompressSync(body).length,
});
const files = new Map();

async function visit(reference, importer = resolve(directory, 'index.html')) {
  if (!reference || !reference.endsWith('.js') || /^(?:https?:|\/\/)/.test(reference)) return;
  const path = reference.startsWith('/')
    ? resolve(directory, `.${reference}`)
    : resolve(dirname(importer), reference);
  if (!path.startsWith(`${directory}${sep}`)) throw new Error(`Resource leaves build: ${reference}`);
  if (files.has(path)) return;
  const body = await readFile(path);
  files.set(path, { file: relative(directory, path).replaceAll(sep, '/'), ...sizes(body) });
  const source = ts.createSourceFile(path, body.toString(), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  for (const statement of source.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      await visit(statement.moduleSpecifier.text, path);
    }
  }
}

for (const element of document.querySelectorAll('script[src], link[rel="modulepreload"][href]')) {
  await visit(element.getAttribute('src') ?? element.getAttribute('href'));
}
const scripts = [...files.values()].sort((a, b) => a.file.localeCompare(b.file));
const total = (items) => items.reduce((sum, item) => ({
  raw: sum.raw + item.raw,
  gzip: sum.gzip + item.gzip,
  brotli: sum.brotli + item.brotli,
}), { raw: 0, gzip: 0, brotli: 0 });
const stylesheets = [];
for (const element of document.querySelectorAll('link[rel="stylesheet"][href]')) {
  const reference = element.getAttribute('href');
  if (/^(?:https?:|\/\/)/.test(reference)) continue;
  const path = resolve(directory, reference.replace(/^\//, ''));
  if (!path.startsWith(`${directory}${sep}`)) throw new Error(`Stylesheet leaves build: ${reference}`);
  if (!stylesheets.some((item) => item.file === reference)) {
    stylesheets.push({ file: reference, ...sizes(await readFile(path)) });
  }
}
const inlineStyles = [...document.querySelectorAll('style')]
  .reduce((sum, element) => sum + Buffer.byteLength(element.textContent), 0);
const inlineScripts = [...document.querySelectorAll('script:not([src])')]
  .filter((element) => !element.type || element.type === 'module' || element.type === 'text/javascript')
  .reduce((sum, element) => sum + Buffer.byteLength(element.textContent), 0);

console.log(JSON.stringify({
  scope: 'Home HTML entry scripts, modulepreloads and their static imports; excludes dynamic/idle-prefetched chunks.',
  html: sizes(html),
  inlineStyles,
  inlineScripts,
  scripts,
  startupJavaScript: total(scripts),
  stylesheets,
  externalStyles: total(stylesheets),
}, null, 2));
dom.window.close();
