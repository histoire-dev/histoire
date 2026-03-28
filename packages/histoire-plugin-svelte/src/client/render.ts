import type { Story, Variant } from '@histoire/shared'
import type {
  PropType as _PropType,
} from '@histoire/vendors/vue'
import type { SvelteStorySetupApi, SvelteStorySetupHandler } from '../helpers.js'
import { components } from '@histoire/controls'
import {
  defineComponent as _defineComponent,
  h as _h,
  onMounted as _onMounted,
  onUnmounted as _onUnmounted,
  ref as _ref,
  watch as _watch,
} from '@histoire/vendors/vue'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
import {
  callSetupFunctions,
  createWrappedComponent,
  getLegacyStateApi,
  mountSvelteComponent,
} from '../util/svelte.js'
import RenderStorySvelte from './RenderStory.svelte'
import RenderVariantSvelte from './RenderVariant.svelte'
import { syncState } from './util'
import Wrap from './Wrap.svelte'

export default _defineComponent({
  name: 'RenderStory',

  props: {
    variant: {
      type: Object as _PropType<Variant>,
      required: true,
    },

    story: {
      type: Object as _PropType<Story>,
      required: true,
    },

    slotName: {
      type: String,
      default: 'default',
    },
  },

  setup(props, { emit }) {
    const el = _ref<HTMLDivElement>()
    let app: any
    let target: HTMLDivElement

    let tearDownHandlers: (() => void)[] = []

    function documentOn(event, cb) {
      document.addEventListener(event, cb)
      const off = () => document.removeEventListener(event, cb)
      tearDownHandlers.push(off)
      return {
        off,
      }
    }

    async function mountStory() {
      target = document.createElement('div')
      el.value.appendChild(target)

      let components = []
      const { off: registerComponentOff } = documentOn('SvelteRegisterComponent', (e) => {
        const { component } = e.detail
        components.push(component)
      })

      const mountedApp = await mountSvelteComponent(props.story.file.component, {
        target,
        props: {
          Hst: {
            Story: RenderStorySvelte,
            Variant: RenderVariantSvelte,
            ...getControls(),
          },
        },
        context: new Map(Object.entries({
          __hstStory: props.story,
          __hstVariant: props.variant,
          __hstSlot: props.slotName,
        })),
      }, 'client')
      app = mountedApp.app
      tearDownHandlers.push(() => {
        mountedApp.destroy()
      })

      let appComponent = components.find(c => c.$$ && app?.$$ && c.$$ === app.$$) ?? app
      registerComponentOff()
      components = []

      function patchReplaceIfAvailable() {
        const origReplace = appComponent?.$replace
        if (!origReplace) {
          return
        }

        appComponent.$replace = (...args) => {
          const result = origReplace.apply(appComponent, args)
          appComponent = result ?? appComponent
          return result
        }
      }
      patchReplaceIfAvailable()

      const stateApi = getLegacyStateApi(appComponent)
      if (stateApi) {
        const { apply, stop } = syncState(props.variant.state, (value) => {
          stateApi.injectState(value)
        })
        tearDownHandlers.push(stop)

        let frameId: number
        const syncFromComponent = () => {
          apply(stateApi.captureState())
          frameId = requestAnimationFrame(syncFromComponent)
        }

        frameId = requestAnimationFrame(syncFromComponent)
        tearDownHandlers.push(() => {
          cancelAnimationFrame(frameId)
        })

        apply(stateApi.captureState())
      }

      const setupApi: SvelteStorySetupApi = {
        app,
        story: props.story,
        variant: props.variant,
      }

      await callSetupFunctions(generatedSetup, setup, setupApi, props.variant.setupApp as SvelteStorySetupHandler | null)

      emit('ready')
    }

    function unmountStory() {
      tearDownHandlers.forEach(fn => fn())
      tearDownHandlers = []
      if (target) {
        target.parentNode?.removeChild(target)
        target = null
      }
      app = null
    }

    _watch(() => props.story.id, async () => {
      unmountStory()
      await mountStory()
    })

    _onMounted(async () => {
      await mountStory()
    })

    _onUnmounted(() => {
      unmountStory()
    })

    return {
      el,
    }
  },

  render() {
    return _h('div', {
      ref: 'el',
    })
  },
})

function getControls() {
  const result: Record<string, any> = {}
  for (const key in components) {
    result[key.substring(3)] = wrapComponent(components[key])
  }
  return result
}

function wrapComponent(controlComponent) {
  return createWrappedComponent(Wrap, controlComponent)
}
