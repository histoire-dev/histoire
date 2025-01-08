export { defaultColors } from './colors.js'
export * from './config.js'
export * from './plugin.js'
export * from '@histoire/shared'

declare module 'rollup' {
  interface PluginContextMeta {
    histoire: {
      isCollecting: boolean
    }
  }
}
