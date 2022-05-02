import type { App } from 'vue'
import type { Story, Variant } from './app/types.js'
export { hstEvent } from './app/util/events'

export type Vue3StorySetupHandler = (payload: {
  app: App
  story?: Story
  variant?: Variant
}) => Promise<void> | void

export function defineSetupVue3 (handler: Vue3StorySetupHandler): Vue3StorySetupHandler {
  return handler
}
