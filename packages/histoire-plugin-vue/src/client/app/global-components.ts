import type { App } from 'vue'
import { components } from '@histoire/controls'
import { wrapControlComponent } from './control-component'
import Story from './Story'
import Variant from './Variant'

/** Register story components and cross-runtime shared controls. */
export function registerGlobalComponents(app: App) {
  app.component('Story', Story)

  app.component('Variant', Variant)

  for (const key in components) {
    app.component(key, wrapControlComponent(components[key]))
  }
}
