import type { Plugin as VitePlugin } from 'vite'
import { isGlobalImport, wrapUserCss } from './transforms.js'

export const USER_CSS_MARK_START = '/*__HST_USER_CSS_START__*/'
export const USER_CSS_MARK_END = '/*__HST_USER_CSS_END__*/'

const DEV_SCOPE_ROOT = '.__histoire-render-story'
const USER_LAYER = 'histoire-user'

export interface UserCssScopePluginOptions {
  enabled: boolean
  /**
   * 'mark' = insert sentinel comments; entry-css-merger wraps per-entry at build time.
   * 'wrap' = wrap directly in @scope at transform time.
   * 'layer' = wrap in @layer histoire-user. Chrome's unlayered rules in the
   *   main page win (no leak); chrome's @layer histoire-defaults rules in the
   *   sandbox iframe lose to histoire-user (user theming applies). Used in dev
   *   to give a build-equivalent visual without per-bundle forking.
   */
  mode?: 'mark' | 'wrap' | 'layer'
}

export function userCssScopePlugin(opts: UserCssScopePluginOptions): VitePlugin {
  const mode = opts.mode ?? 'mark'
  return {
    name: 'histoire:style-isolation:user-css',
    transform(code, id) {
      if (!opts.enabled) return null
      if (!isCssId(id)) return null
      if (isGlobalImport(id)) return null
      if (isChromeCss(id)) return null
      if (mode === 'wrap') {
        return {
          code: wrapUserCss(code, { scopeRoot: DEV_SCOPE_ROOT }),
          map: null,
        }
      }
      if (mode === 'layer') {
        return {
          code: `@layer ${USER_LAYER} {\n${code}\n}\n`,
          map: null,
        }
      }
      return {
        code: `${USER_CSS_MARK_START}\n${code}\n${USER_CSS_MARK_END}\n`,
        map: null,
      }
    },
  }
}

function isCssId(id: string): boolean {
  const [path, query = ''] = id.split('?')
  if (/\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/.test(path)) return true
  // Vue / Svelte / Vite virtual style modules carry the source extension as
  // a `lang.<ext>` query, e.g. `Foo.vue?vue&type=style&index=0&lang.css`.
  return /[?&]lang\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)(?:&|$)/.test(query)
}

export function isChromeCss(id: string): boolean {
  const cleaned = id.split('?')[0]
  return cleaned.includes('@histoire/app/')
    || cleaned.includes('histoire-app/')
    || cleaned.includes('@histoire/controls/')
    || cleaned.includes('histoire-controls/')
    || cleaned.includes('@histoire/vendors/')
    || cleaned.includes('histoire-vendors/')
    || cleaned.includes('virtual:$histoire-')
}
