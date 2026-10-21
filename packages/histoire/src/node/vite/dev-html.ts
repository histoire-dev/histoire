import type { ServerResponse } from 'node:http'
import type { Connect, ViteDevServer } from 'vite'
import type { Context } from '../context.js'
import { lookup as lookupMime } from 'mrmime'
import { APP_PATH, getHistoireStyleFiles } from '../alias.js'
import { getDevClientPreloads } from '../server/client-ready.js'
import { RESOLVED_PREVIEW_RUNTIME_ID } from '../virtual/index.js'
import { renderVitestRunnerBootstrap } from '../virtual/vitest-runner-bootstrap.js'
import { versionModuleFile } from './module-version.js'

/** Early Histoire routes inherit Vite headers without replacing caller-owned response policy. */
export function applyDevResponseHeaders(server: ViteDevServer, res: ServerResponse): void {
  for (const [name, value] of Object.entries(server.config.server?.headers ?? {})) {
    if (value !== undefined && res.getHeader?.(name) === undefined) res.setHeader(name, value)
  }
}

/**
 * Suffix of the app bundles served in local Histoire development.
 */
function getBundleSuffix() {
  return process.env.HISTOIRE_DEV ? '-dev' : ''
}

/**
 * Head and entry script of the sandbox document.
 *
 * Built Histoire styles load as `<link>` stylesheets: with versioned URLs the
 * browser caches and reuses them across sandbox documents, instead of every
 * iframe evaluating ~270KB of CSS wrapped in JS modules and injecting it
 * through the HMR client. The entry script is then the preview runtime itself.
 * Local Histoire development keeps the CSS imports of its `-dev` bundle, whose
 * source styles hot-update.
 * @param version Maps an absolute file path to its versioned module path.
 */
export function renderSandboxEntry(version: (file: string) => string) {
  if (process.env.HISTOIRE_DEV) {
    return {
      head: '',
      script: `<script type="module" src="/@fs/${APP_PATH}/bundle-sandbox${getBundleSuffix()}.js"></script>`,
    }
  }
  const { style, bundledStyle } = getHistoireStyleFiles()
  return {
    head: [style, bundledStyle].map(file => `<link rel="stylesheet" href="/@fs/${version(file)}">`).join('\n  '),
    script: `<script type="module" src="${RESOLVED_PREVIEW_RUNTIME_ID}"></script>`,
  }
}

/**
 * Renders the HTML document of the story sandbox iframe.
 * @param server Dev server versioning the document's stylesheet URLs.
 */
function renderSandboxHtml(server: ViteDevServer) {
  const entry = renderSandboxEntry(file => versionModuleFile(server, file))
  return `
<!DOCTYPE html>
<html>
<head>
  <title></title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
  ${entry.head}
</head>
<body>
  <div id="app"></div>
${renderVitestRunnerBootstrap('  ')}
  <script>
  // Hide spammy vite messages
  const origConsoleLog = console.log
  console.log = (...args) => {
    if (typeof args[0] !== 'string' || !args[0].startsWith('[vite] connect')) {
      origConsoleLog(...args)
    }
  }
  </script>
  ${entry.script}
</body>
</html>`
}

/**
 * Renders the HTML document of the Histoire app shell.
 * @param ctx The histoire context, used for the configured favicon.
 * @param server Exact dev server owning base path and ready module preload hints.
 */
function renderAppHtml(ctx: Context, server: ViteDevServer) {
  const base = server.config.base
  const preloads = getDevClientPreloads(server).map(url => `<link rel="modulepreload" crossorigin href="${url.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}">`).join('\n')
  return `
<!DOCTYPE html>
<html>
  <head>
    <title></title>
    <link rel="icon" href=""/>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="">
    ${preloads}
    ${ctx.config.theme?.favicon ? `<link rel="icon" type="${lookupMime(ctx.config.theme.favicon)}" href="${base}${ctx.config.theme.favicon}"/>` : ''}
  </head>
  <body>
    <div id="app"></div>
${renderVitestRunnerBootstrap('    ')}
    <script type="module" src="/@fs/${APP_PATH}/bundle-main${getBundleSuffix()}.js"></script>
  </body>
</html>`
}

/**
 * Serves an HTML document through Vite's index transforms, which inject the HMR
 * client and let other plugins post-process the markup.
 */
async function sendHtml(server: ViteDevServer, req: Connect.IncomingMessage, res: any, html: string) {
  applyDevResponseHeaders(server, res)
  res.statusCode = 200
  const transformed = await server.transformIndexHtml(req.url!, html)
  res.setHeader('content-type', 'text/html; charset=UTF-8')
  res.end(transformed)
}

/**
 * Middleware serving the story sandbox document on `<base>__sandbox`.
 * @param server The Vite dev server the middleware is registered on.
 */
export function createSandboxHtmlMiddleware(server: ViteDevServer): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.url!.startsWith(`${server.config.base}__sandbox`)) {
      await sendHtml(server, req, res, renderSandboxHtml(server))
      return
    }
    next()
  }
}

/**
 * Middleware serving the Histoire app shell for every `.html` request.
 *
 * Registered after Vite's history fallback so real files still win.
 * @param server The Vite dev server the middleware is registered on.
 * @param ctx The histoire context.
 */
export function createAppHtmlMiddleware(server: ViteDevServer, ctx: Context): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.url!.endsWith('.html')) {
      await sendHtml(server, req, res, renderAppHtml(ctx, server))
      return
    }
    next()
  }
}
