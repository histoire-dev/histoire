import type { App } from 'vue'
import HstCheckboxVue from './components/checkbox/HstCheckbox.vue'
import HstTextVue from './components/text/HstText.vue'
import HstPresetsVue from './components/presets/HstPresets.vue'
import HstNumberVue from './components/number/HstNumber.vue'
import HstTextareaVue from './components/textarea/HstTextarea.vue'
import HstSelectVue from './components/select/HstSelect.vue'
import HstColorShadesVue from './components/design-tokens/HstColorShades.vue'
import HstTokenListVue from './components/design-tokens/HstTokenList.vue'
import HstTokenGridVue from './components/design-tokens/HstTokenGrid.vue'
import HstCopyIconVue from './components/HstCopyIcon.vue'

export const HstCheckbox = HstCheckboxVue
export const HstText = HstTextVue
export const HstPresets = HstPresetsVue
export const HstNumber = HstNumberVue
export const HstTextarea = HstTextareaVue
export const HstColorShades = HstColorShadesVue
export const HstTokenList = HstTokenListVue
export const HstTokenGrid = HstTokenGridVue
export const HstCopyIcon = HstCopyIconVue

export function registerVueComponents (app: App) {
  app.component('HstCheckbox', HstCheckboxVue)
  app.component('HstText', HstTextVue)
  app.component('HstPresets', HstPresets)
  app.component('HstNumber', HstNumberVue)
  app.component('HstSelect', HstSelectVue)
  app.component('HstTextarea', HstTextareaVue)
  app.component('HstColorShades', HstColorShadesVue)
  app.component('HstTokenList', HstTokenListVue)
  app.component('HstTokenGrid', HstTokenGridVue)
}
