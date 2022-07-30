/* eslint-disable vue/one-component-per-file */

import Vue, {
  defineComponent,
  ref,
  h,
  onMounted,
  onUpdated,
  onBeforeUnmount,
  computed,
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
import { syncStateBundledAndExternal } from './util.js'

export function registerGlobalComponents (app) {
  Vue.config.productionTip = false

  // eslint-disable-next-line vue/multi-word-component-names
  Vue.component('Story', Story)
  // eslint-disable-next-line vue/multi-word-component-names
  Vue.component('Variant', Variant)

  for (const key in components) {
    Vue.component(key, wrapControlComponent(components[key]))
  }
}

function wrapControlComponent (controlComponent) {
  return defineComponent({
    name: controlComponent.name,
    inheritAttrs: false,
    setup (props, { attrs, listeners }) {
      const el = ref<HTMLDivElement>()
      const slotEl = ref<HTMLDivElement>()

      // Attrs

      const state = _reactive<{
        attrs?: any
        listeners?: any
      }>({})

      syncStateBundledAndExternal(state, computed(() => ({
        attrs,
        listeners,
      })))

      // Slots

      let newSlotCalls = []
      const slotCalls = ref([])

      function moveSlotContent () {
        slotCalls.value.forEach((props, index) => {
          const renderedEl = slotEl.value.querySelector(`[renderslotid="${index}"]`)
          if (!renderedEl) return
          const targetEl = el.value.querySelector(`[slotid="${index}"]`)
          while (targetEl.firstChild) {
            targetEl.removeChild(targetEl.lastChild)
          }
          targetEl.appendChild(renderedEl)
        })
      }

      // App

      let app: _App

      onMounted(() => {
        app = _createApp({
          mounted () {
            slotCalls.value = newSlotCalls
            newSlotCalls = []
          },
          updated () {
            slotCalls.value = newSlotCalls
            newSlotCalls = []
          },
          render () {
            const finalAttrs = {}
            if (state.attrs) {
              for (const key in state.attrs) {
                const finalKey = key === 'value' ? 'modelValue' : key
                finalAttrs[finalKey] = state.attrs[key]
              }
            }

            const finalListeners = {}
            if (state.listeners) {
              for (const key in state.listeners) {
                const finalKey = key === 'input' ? 'update:modelValue' : key
                finalListeners[`on${finalKey.charAt(0).toUpperCase()}${finalKey.substring(1)}`] = (...args) => state.listeners[key](...args)
              }
            }

            return _h(controlComponent, {
              ...finalAttrs,
              ...finalListeners,
              key: 'component',
            }, {
              default: props => {
                newSlotCalls.push(props)
                return _h('div', {
                  slotId: newSlotCalls.length - 1,
                })
              },
            })
          },
        })
        app.mount(el.value)
      })

      onUpdated(() => {
        moveSlotContent()
      })

      onBeforeUnmount(() => {
        app.unmount()
      })

      return {
        el,
        slotEl,
        slotCalls,
      }
    },
    render () {
      return h('div', [
        h('div', {
          ref: 'el',
        }),
        h('div', {
          ref: 'slotEl',
        }, this.slotCalls.map((props, index) => h('div', {
          attrs: {
            renderSlotId: index,
          },
        // eslint-disable-next-line vue/no-deprecated-dollar-scopedslots-api
        }, this.$scopedSlots.default(props)))),
      ])
    },
  })
}
