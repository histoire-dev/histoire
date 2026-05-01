import type { Plugin as VitePlugin } from 'vite'
import { STORY_SCOPE_ROOT } from './selectors.js'
import { wrapUserCss } from './transforms.js'

export const USER_CSS_MARK_START = '/*__HST_USER_CSS_START__*/'
export const USER_CSS_MARK_END = '/*__HST_USER_CSS_END__*/'

export interface UserCssScopePluginOptions {
  enabled: boolean
  /**
   * 'mark' — insert sentinel comments; entry-css-merger wraps per-entry at
   * build time. 'wrap' — wrap directly in @scope at transform time (dev,
   * no merger).
   */
  mode?: 'mark' | 'wrap'
}

export function userCssScopePlugin(opts: UserCssScopePluginOptions): VitePlugin {
  const mode = opts.mode ?? 'mark'
  return {
    name: 'histoire:style-isolation:user-css',
    transform(code, id) {
      if (!opts.enabled) return null
      const q = id.indexOf('?')
      const path = q === -1 ? id : id.slice(0, q)
      const query = q === -1 ? '' : id.slice(q + 1)
      // Cheap substring rejection of all histoire-internal CSS first.
      if (isChromePath(path)) return null
      if (!isCssPath(path, query)) return null
      if (hasGlobalQuery(query)) return null
      if (mode === 'wrap') {
        return { code: wrapUserCss(code, { scopeRoot: STORY_SCOPE_ROOT }), map: null }
      }
      return {
        code: `${USER_CSS_MARK_START}\n${code}\n${USER_CSS_MARK_END}\n`,
        map: null,
      }
    },
  }
}

const CSS_EXT_RE = /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/
// Vue / Svelte / Vite virtual style modules carry the source extension as a
// `lang.<ext>` query, e.g. `Foo.vue?vue&type=style&index=0&lang.css`.
const CSS_LANG_QUERY_RE = /(?:^|&)lang\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)(?:&|$)/

function isCssPath(path: string, query: string): boolean {
  return CSS_EXT_RE.test(path) || CSS_LANG_QUERY_RE.test(query)
}

function hasGlobalQuery(query: string): boolean {
  if (!query) return false
  const parts = query.split('&')
  return parts.includes('global') || parts.some(p => p.startsWith('global='))
}

export function isChromeCss(id: string): boolean {
  const q = id.indexOf('?')
  return isChromePath(q === -1 ? id : id.slice(0, q))
}

function isChromePath(path: string): boolean {
  return path.includes('@histoire/app/')
    || path.includes('histoire-app/')
    || path.includes('@histoire/controls/')
    || path.includes('histoire-controls/')
    || path.includes('@histoire/vendors/')
    || path.includes('histoire-vendors/')
    || path.includes('virtual:$histoire-')
}
