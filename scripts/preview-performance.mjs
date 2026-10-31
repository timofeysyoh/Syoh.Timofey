// Local diagnostic preview only; this server is never part of the deployed site.
// Usage: node scripts/preview-performance.mjs <browser-directory> <port>
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let directory;
let portValue;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--directory') directory = args[++index];
  else if (args[index] === '--port') portValue = args[++index];
  else if (!directory) directory = args[index];
  else if (!portValue) portValue = args[index];
  else throw new Error('Usage: node scripts/preview-performance.mjs <browser-directory> <port>');
}

const port = Number(portValue ?? 4173);
if (!directory || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Provide a browser output directory and an integer port between 1 and 65535.');
}

const root = await realpath(resolve(directory));
if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);
const probe = await readFile(fileURLToPath(new URL('./performance-probe.js', import.meta.url)));
const probeTag = '<script src="/__performance-probe.js" defer></script>';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function isInsideRoot(path) {
  const normalizedRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const normalizedPath = process.platform === 'win32' ? path.toLowerCase() : path;
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

function send(response, request, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

async function localFile(path) {
  try {
    let target = await realpath(path);
    if (!isInsideRoot(target)) return { forbidden: true };
    let information = await stat(target);
    if (information.isDirectory()) {
      target = await realpath(join(target, 'index.html'));
      if (!isInsideRoot(target)) return { forbidden: true };
      information = await stat(target);
    }
    return information.isFile() ? { target } : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, request, 405, 'Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    } catch {
      send(response, request, 400, 'Invalid URL');
      return;
    }

    if (pathname === '/__performance-probe.js') {
      send(response, request, 200, probe, mime['.js']);
      return;
    }

    const segments = pathname.split('/');
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':') ||
      segments.some((segment) => segment.startsWith('.') ||
        ['_headers', '_redirects'].includes(segment.toLowerCase()))) {
      send(response, request, 403, 'Forbidden');
      return;
    }

    const path = resolve(root, `.${pathname}`);
    if (!isInsideRoot(path)) {
      send(response, request, 403, 'Forbidden');
      return;
    }

    let file = await localFile(path);
    if (file?.forbidden) {
      send(response, request, 403, 'Forbidden');
      return;
    }
    const status = file ? 200 : 404;
    if (!file) file = await localFile(join(root, '404.html'));
    if (!file || file.forbidden) {
      send(response, request, 404, 'Page not found');
      return;
    }
    // Files reached through a symlink must still respect the private-file rule.
    if (relative(root, file.target).split(sep).some((segment) => segment.startsWith('.') ||
      ['_headers', '_redirects'].includes(segment.toLowerCase()))) {
      send(response, request, 403, 'Forbidden');
      return;
    }

    const extension = extname(file.target).toLowerCase();
    let body = await readFile(file.target);
    if (extension === '.html') {
      const html = body.toString('utf8');
      body = Buffer.from(/<head(?:\s[^>]*)?>/i.test(html)
        ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${probeTag}`)
        : `${probeTag}${html}`);
    }
    send(response, request, status, body, mime[extension] ?? 'application/octet-stream');
  } catch (error) {
    console.error(error);
    if (!response.headersSent) send(response, request, 500, 'Local preview error');
    else response.end();
  }
});

server.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Performance preview: http://127.0.0.1:${port}/`);
  console.log(`Serving ${root}; injected diagnostics are local-only.`);
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
