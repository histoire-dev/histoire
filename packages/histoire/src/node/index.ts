export { tailwindTokens } from './builtin-plugins/tailwind-tokens.js'
export type { TailwindTokensOptions } from './builtin-plugins/tailwind-tokens.js'
export { defaultColors } from './colors.js'
export * from './config/index.js'
export * from './plugin.js'
export * from '@histoire/shared'

declare module 'rollup' {
  interface PluginContextMeta {
    histoire: {
      isCollecting: boolean
    }
  }
}
