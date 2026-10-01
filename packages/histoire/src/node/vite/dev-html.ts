import type { Connect, ViteDevServer } from 'vite'
import type { Context } from '../context.js'
import { lookup as lookupMime } from 'mrmime'
import { APP_PATH } from '../alias.js'
import { renderVitestRunnerBootstrap } from '../virtual/vitest-runner-bootstrap.js'

/**
 * Suffix of the app bundles served in local Histoire development.
 */
function getBundleSuffix() {
  return process.env.HISTOIRE_DEV ? '-dev' : ''
}

/**
 * Renders the HTML document of the story sandbox iframe.
 */
function renderSandboxHtml() {
  return `
<!DOCTYPE html>
<html>
<head>
  <title></title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
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
  <script type="module" src="/@fs/${APP_PATH}/bundle-sandbox${getBundleSuffix()}.js"></script>
</body>
</html>`
}

/**
 * Renders the HTML document of the Histoire app shell.
 * @param ctx The histoire context, used for the configured favicon.
 * @param base The dev server base path the favicon is served from.
 */
function renderAppHtml(ctx: Context, base: string) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <title></title>
    <link rel="icon" href=""/>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="">
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
      await sendHtml(server, req, res, renderSandboxHtml())
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
      await sendHtml(server, req, res, renderAppHtml(ctx, server.config.base))
      return
    }
    next()
  }
}
