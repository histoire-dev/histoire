import type { Plugin as VitePlugin } from 'vite'
import { APP_SCOPE_ROOT, DEFAULTS_LAYER, STORY_SCOPE_ROOT } from './selectors.js'
import { wrapChromeCss } from './transforms.js'
import { isChromeCss } from './vite-plugin.js'

export interface ChromeCssScopePluginOptions {
  enabled: boolean
}

export function chromeCssScopePlugin(opts: ChromeCssScopePluginOptions): VitePlugin {
  return {
    name: 'histoire:style-isolation:chrome-css',
    transform(code, id) {
      if (!opts.enabled) return null
      if (isMainChromeCss(id)) {
        return { code: wrapChromeCss(code, { scopeRoot: APP_SCOPE_ROOT, scopeLower: STORY_SCOPE_ROOT }), map: null }
      }
      if (isSandboxChromeCss(id)) {
        // Sandbox chrome defaults coexist with user CSS inside the iframe.
        // @layer makes user's unlayered rules win the cascade.
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
