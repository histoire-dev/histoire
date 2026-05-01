import type { Plugin as VitePlugin } from 'vite'
import { wrapChromeCss } from './transforms.js'

const SCOPE_ROOT = '.histoire-app-root'
const SCOPE_LOWER = '.__histoire-render-story'

export interface ChromeCssScopePluginOptions {
  enabled: boolean
}

const CHROME_CSS_SUFFIX = '@histoire/app/dist/style.css'

export function chromeCssScopePlugin(opts: ChromeCssScopePluginOptions): VitePlugin {
  return {
    name: 'histoire:style-isolation:chrome-css',
    transform(code, id) {
      if (!opts.enabled) return null
      const cleaned = id.split('?')[0]
      if (!cleaned.endsWith(CHROME_CSS_SUFFIX) && !cleaned.endsWith('histoire-app/dist/style.css')) {
        return null
      }
      if (!cleaned.includes('@histoire/app') && !cleaned.includes('histoire-app/dist/')) {
        return null
      }
      const wrapped = wrapChromeCss(code, { scopeRoot: SCOPE_ROOT, scopeLower: SCOPE_LOWER })
      return { code: wrapped, map: null }
    },
  }
}
