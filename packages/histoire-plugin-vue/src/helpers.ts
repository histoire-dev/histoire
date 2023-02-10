import type { Story, Variant } from '@histoire/shared'
import type { App } from 'vue'

export type Vue3StorySetupHandler = (payload: {
  app: App
  story?: Story
  variant?: Variant
}) => Promise<void> | void

export function defineSetupVue3 (handler: Vue3StorySetupHandler): Vue3StorySetupHandler {
  return handler
}
