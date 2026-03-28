export * from './app/index.js'
export * from './codegen.js'

declare module '@histoire/shared' {
  interface StoryMeta {
    hasVariantChildComponents?: boolean
  }
}
