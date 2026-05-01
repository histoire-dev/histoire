import type { Plugin as VitePlugin } from 'vite'
import { isGlobalImport } from './transforms.js'

export const USER_CSS_MARK_START = '/*__HST_USER_CSS_START__*/'
export const USER_CSS_MARK_END = '/*__HST_USER_CSS_END__*/'

export interface UserCssScopePluginOptions {
  enabled: boolean
}

export function userCssScopePlugin(opts: UserCssScopePluginOptions): VitePlugin {
  return {
    name: 'histoire:style-isolation:user-css',
    transform(code, id) {
      if (!opts.enabled) return null
      if (!isCssId(id)) return null
      if (isGlobalImport(id)) return null
      if (isChromeCss(id)) return null
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
  return cleaned.includes('@histoire/app/dist/')
    || cleaned.includes('histoire-app/dist/')
    || cleaned.includes('histoire-app/src/app/style/')
}
