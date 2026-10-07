/** Serve a frozen Histoire build with SPA fallback for repeatable browser checks. */
const fs = require('node:fs')

const path = require('node:path')

const root = path.resolve(process.argv[2] ?? '')
const port = Number(process.argv[3] ?? 6082)
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

if (!process.argv[2] || !Number.isInteger(port) || !fs.existsSync(path.join(root, 'index.html'))) {
  throw new Error('Usage: node plans/tailwind-switch-performance/serve-static.cjs <build-dir> [port]')
}

/** Resolve request to an in-root file, falling back to the workbench entry. */
function resolveRequestFile(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  const candidate = path.resolve(root, `.${pathname}`)
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== path.join(root, 'index.html')) return path.join(root, 'index.html')
  try {
    const stat = fs.statSync(candidate)
    return stat.isDirectory() ? path.join(candidate, 'index.html') : candidate
  }
  catch {
    return path.join(root, 'index.html')
  }
}

require('node:http').createServer((request, response) => {
  const file = resolveRequestFile(request.url ?? '/')
  response.setHeader('Content-Type', mimeTypes[path.extname(file)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-cache')
  const stream = fs.createReadStream(file)
  stream.on('error', () => {
    response.statusCode = 404
    response.end()
  })
  if (request.method === 'HEAD') {
    response.end()
    stream.destroy()
  }
  else {
    stream.pipe(response)
  }
}).listen(port, '127.0.0.1', () => process.stdout.write(`Serving ${root} on http://127.0.0.1:${port}/\n`))
