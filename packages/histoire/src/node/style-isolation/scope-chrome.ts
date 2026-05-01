import type { Plugin as VitePlugin } from 'vite'
import { wrapChromeCss } from './transforms.js'
import { isChromeCss } from './vite-plugin.js'

const SCOPE_ROOT = '.histoire-app-root'
const SCOPE_LOWER = '.__histoire-render-story'
const DEFAULTS_LAYER = 'histoire-defaults'

export interface ChromeCssScopePluginOptions {
  enabled: boolean
}

export function chromeCssScopePlugin(opts: ChromeCssScopePluginOptions): VitePlugin {
  return {
    name: 'histoire:style-isolation:chrome-css',
    transform(code, id) {
      if (!opts.enabled) return null
      if (isMainChromeCss(id)) {
        return { code: wrapChromeCss(code, { scopeRoot: SCOPE_ROOT, scopeLower: SCOPE_LOWER }), map: null }
      }
      if (isSandboxChromeCss(id)) {
        // Sandbox chrome defaults coexist with user CSS inside the iframe.
        // Wrap them in @layer so user's unlayered rules win the cascade.
        return { code: `@layer ${DEFAULTS_LAYER} {\n${code}\n}\n`, map: null }
      }
      return null
    },
  }
}

// Stylesheets loaded only by the chrome page (bundle-main).
function isMainChromeCss(id: string): boolean {
  if (!isChromeCss(id)) return false
  const cleaned = id.split('?')[0]
  return /(?:histoire-app|@histoire\/app)\/(?:dist\/style\.css|dist\/bundled\/[^/]+\.css|src\/app\/style\/main\.(?:css|pcss))$/.test(cleaned)
}

// Stylesheets loaded into the sandbox iframe — must coexist with user CSS,
// so they get a cascade-layer wrap rather than an @scope wrap.
function isSandboxChromeCss(id: string): boolean {
  if (!isChromeCss(id)) return false
  const cleaned = id.split('?')[0]
  return /\/(?:histoire-app|@histoire\/app)\/(?:dist|src)\/.*\bsandbox\.css$/.test(cleaned)
    || /\/(?:histoire-controls|@histoire\/controls)\/dist\/index\.es\.css$/.test(cleaned)
}
