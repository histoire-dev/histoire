import type { App } from 'vue'
import type { Story, Variant } from './app/types.js'

export type Vue3StorySetupHandler = (payload: {
  app: App
  story: Story
  variant: Variant
}) => Promise<void> | void

export function defineVue3StorySetup (handler: Vue3StorySetupHandler): Vue3StorySetupHandler {
  return handler
}
