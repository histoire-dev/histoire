/* eslint-disable vue/one-component-per-file */

import {
  App,
  defineComponent,
  ref,
  h,
  onMounted,
  onBeforeUpdate,
  onBeforeUnmount,
} from 'vue'
import {
  createApp as _createApp,
  h as _h,
  App as _App,
  reactive as _reactive,
} from '@histoire/vendors/vue'
import { components } from '@histoire/controls'
import Story from './Story'
import Variant from './Variant'

export function registerGlobalComponents (app: App) {
  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Story', Story)
  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Variant', Variant)

  for (const key in components) {
    app.component(key, wrapControlComponent(components[key]))
  }
}

function wrapControlComponent (controlComponent) {
  return defineComponent({
    name: controlComponent.name,
    inheritAttrs: false,
    setup (props, { attrs }) {
      const el = ref<HTMLDivElement>()

      // Attrs

      const state = _reactive({})

      function applyState (data) {
        Object.assign(state, data)
      }

      applyState(attrs)
      onBeforeUpdate(() => {
        applyState(attrs)
      })

      // App

      let app: _App

      onMounted(() => {
        app = _createApp({
          render () {
            return _h(controlComponent, {
              ...state,
              key: 'component',
            })
          },
        })
        app.mount(el.value)
      })

      onBeforeUnmount(() => {
        app.unmount()
      })

      return {
        el,
      }
    },
    render () {
      return h('div', {
        ref: 'el',
      })
    },
  })
}
