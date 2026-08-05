import type { Context } from '../context.js'
import { lookup as lookupMime } from 'mrmime'
import { renderVitestRunnerBootstrap } from '../virtual/vitest-runner-bootstrap.js'

/** Wraps head/body fragments in the shared document skeleton. */
function generateBaseHtml(head: string, body: string, ctx: Context) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>${ctx.config.theme.title}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
  ${head}
</head>
<body>
  ${body}
</body>
</html>`
}

/**
 * Builds one of the two emitted entry documents (`index.html` and
 * `__sandbox.html`) around a built JS/CSS chunk pair.
 *
 * @param jsEntryFile File name of the entry chunk.
 * @param cssEntryFile File name of the style asset.
 * @param variables Extra fragments to splice into the document.
 * @param variables.HEAD Extra tags injected in `<head>` (preload/prefetch links).
 * @param ctx Histoire context, for the theme and the resolved Vite base.
 */
export function generateEntryHtml(jsEntryFile: string, cssEntryFile: string, variables: { HEAD?: string }, ctx: Context) {
  return generateBaseHtml(
    `<link rel="stylesheet" href="${ctx.resolvedViteConfig.base}${cssEntryFile}">
    ${ctx.config.theme?.favicon ? `<link rel="icon" type="${lookupMime(ctx.config.theme.favicon)}" href="${ctx.resolvedViteConfig.base}${ctx.config.theme.favicon}"/>` : ''}
    ${variables.HEAD ?? ''}`,
    `<div id="app"></div>
    ${renderVitestRunnerBootstrap('    ')}
    <script type="module" src="${ctx.resolvedViteConfig.base}${jsEntryFile}"></script>`,
    ctx,
  )
}

/**
 * Emits `<link rel="preload|prefetch">` tags for the given built chunks.
 *
 * @param prefetchScripts File names of the built chunks to link.
 * @param rel Link relation to emit.
 * @param ctx Histoire context, for the resolved Vite base.
 */
export function generateScriptLinks(prefetchScripts: string[], rel: string, ctx: Context) {
  return prefetchScripts.map(s => `<link rel="${rel}" href="${ctx.resolvedViteConfig.base}${s}" as="script" crossOrigin="anonymous">`).join('')
}
