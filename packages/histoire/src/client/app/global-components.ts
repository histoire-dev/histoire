import { App } from 'vue'
import Story from './components/exposed/Story.vue'
import Variant from './components/exposed/Variant.vue'

export function registerGlobalComponents (app: App) {
  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Story', Story)
  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Variant', Variant)
}
