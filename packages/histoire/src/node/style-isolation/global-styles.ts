import type { Plugin as VitePlugin } from 'vite'
import { resolve } from 'pathe'

const VIRTUAL_ID = 'virtual:$histoire-global-styles'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

export interface GlobalStylesPluginOptions {
  files: string[]
  rootDir: string
}

export function globalStylesPlugin(opts: GlobalStylesPluginOptions): VitePlugin {
  return {
    name: 'histoire:style-isolation:global-styles',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      return opts.files
        .map(f => `import ${JSON.stringify(`${resolve(opts.rootDir, f)}?histoire-global-layer`)}`)
        .join('\n')
    },
    transform(code, id) {
      if (!id.includes('?histoire-global-layer')) return null
      return {
        code: `@layer histoire-user-globals {\n${code}\n}\n`,
        map: null,
      }
    },
  }
}

export function getGlobalStylesVirtualId(): string {
  return VIRTUAL_ID
}
