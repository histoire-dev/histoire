import type { App } from 'vue'
import HstCheckboxVue from './components/checkbox/HstCheckbox.vue'
import HstTextVue from './components/text/HstText.vue'
import HstNumberVue from './components/number/HstNumber.vue'
import HstTextareaVue from './components/textarea/HstTextarea.vue'

export const HstCheckbox = HstCheckboxVue
export const HstText = HstTextVue

export function registerVueComponents (app: App) {
  app.component('HstCheckbox', HstCheckboxVue)
  app.component('HstText', HstTextVue)
  app.component('HstNumber', HstNumberVue)
  app.component('HstTextarea', HstTextareaVue)
}
