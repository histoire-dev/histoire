import type { Story, Variant } from '@histoire/shared'
import type { App, Component } from 'vue'

/** Options for scoping a setup wrapper to story or custom-controls rendering. */
export interface Vue3StoryWrapperOptions {
  /** Include custom controls inside this wrapper. Defaults to `true`. */
  controls?: boolean
}

export interface Vue3StorySetupApi {
  /** Reactive globals for this isolated story document. */
  globals?: import('@histoire/shared').HistoireGlobals
  app: App
  story?: Story
  variant?: Variant
  /** Register wrapper; opt out of the custom-controls surface for visual-only wrappers. */
  addWrapper: (wrapper: Component, options?: Vue3StoryWrapperOptions) => void
}

export type Vue3StorySetupHandler = (api: Vue3StorySetupApi) => Promise<void> | void

export function defineSetupVue3(handler: Vue3StorySetupHandler): Vue3StorySetupHandler {
  return handler
}
