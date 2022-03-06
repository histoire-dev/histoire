import type { App } from 'vue'
import HstCheckboxVue from './components/checkbox/HstCheckbox.vue'
import HstInputVue from './components/input/HstInput.vue'

export const HstCheckbox = HstCheckboxVue
export const HstInput = HstInputVue

export function registerVueComponents (app: App) {
  app.component('HstCheckbox', HstCheckboxVue)
  app.component('HstInput', HstInputVue)
}
