<script lang="ts">
import { onMount, createEventDispatcher } from 'svelte'
import {
  createApp as _createApp,
  h as _h,
  App as _App,
  reactive as _reactive,
} from '@histoire/vendors/vue'

export let controlComponent
export let value

const dispatch = createEventDispatcher()

let el: HTMLDivElement

let app: _App

const state = _reactive<{
  value?: any
  attrs?: any
}>({})

function updateState (value, attrs) {
  Object.assign(state, {
    value,
    attrs,
  })
}

onMount(() => {
  updateState(value, $$restProps)

  app = _createApp({
    render () {
      const finalListeners = {}
      if (controlComponent.emits) {
        for (const k in controlComponent.emits) {
          const key = Array.isArray(controlComponent.emits) ? controlComponent.emits[k] : k
          const finalKey = key === 'input' ? 'update:modelValue' : key
          finalListeners[`on${finalKey.charAt(0).toUpperCase()}${finalKey.substring(1)}`] = (...args) => {
            if (key === 'update:modelValue') {
              value = args[0]
            } else {
              dispatch(key, ...args)
            }
          }
        }
      }

      return _h(controlComponent, {
        modelValue: value,
        ...state.attrs,
        ...finalListeners,
        key: 'component',
      })
    },
  })
  app.mount(el)
})

$: updateState(value, $$restProps)
</script>

<div bind:this={el}>
  {controlComponent.name}
</div>
