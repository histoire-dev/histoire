<script>
import { onMount, createEventDispatcher } from 'svelte'
import {
  createApp as _createApp,
  h as _h,
  reactive as _reactive,
} from '@histoire/vendors/vue'

export let controlComponent
export let value

const dispatch = createEventDispatcher()

let el

let app

const state = _reactive({})

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
