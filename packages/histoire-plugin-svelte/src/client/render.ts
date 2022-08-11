/* eslint-disable vue/one-component-per-file */

import { SvelteComponent } from 'svelte/internal'
import {
  defineComponent as _defineComponent,
  PropType as _PropType,
  onMounted as _onMounted,
  onUnmounted as _onUnmounted,
  ref as _ref,
  watch as _watch,
  h as _h,
} from '@histoire/vendors/vue'
import type { Story, Variant } from '@histoire/shared'
// @ts-expect-error virtual module id
import * as setup from '$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from '$histoire-generated-global-setup'
import RenderStorySvelte from './RenderStory.svelte'
import RenderVariantSvelte from './RenderVariant.svelte'
import { syncState } from './util'

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

  setup (props, { emit }) {
    const el = _ref<HTMLDivElement>()
    let app: SvelteComponent
    let target: HTMLDivElement

    let tearDownHandlers: (() => void)[] = []

    function documentOn (event, cb) {
      document.addEventListener(event, cb)
      const off = () => document.removeEventListener(event, cb)
      tearDownHandlers.push(off)
      return {
        off,
      }
    }

    async function mountStory () {
      target = document.createElement('div')
      el.value.appendChild(target)

      let components = []
      const { off: registerComponentOff } = documentOn('SvelteRegisterComponent', e => {
        const { component } = e.detail
        components.push(component)
      })

      // eslint-disable-next-line new-cap
      app = new props.story.file.component({
        target,
        props: {
          Hst: {
            // @ts-ignore
            Story: RenderStorySvelte,
            // @ts-ignore
            Variant: RenderVariantSvelte,
          },
        },
        context: new Map(Object.entries({
          __hstStory: props.story,
          __hstVariant: props.variant,
          __hstSlot: props.slotName,
        })),
      })

      let appComponent = components.find(c => c.$$ === app.$$)
      registerComponentOff()
      components = []

      // Svelte on_hrm callbacks are buggy so we patch the hmr replace instead
      function patchReplace () {
        const origReplace = appComponent.$replace
        if (!origReplace) return
        appComponent.$replace = (...args) => {
          const result = origReplace.apply(appComponent, args)
          appComponent = result
          watchState()
          patchReplace()
          return result
        }
      }
      patchReplace()

      const { apply, stop } = syncState(props.variant.state, (value) => {
        appComponent.$inject_state(value)
      })
      tearDownHandlers.push(stop)

      function watchState () {
        appComponent.$$.after_update.push(() => {
          apply(appComponent.$capture_state())
        })
      }
      watchState()
      apply(appComponent.$capture_state())

      // Call app setups to resolve global assets such as components

      if (typeof generatedSetup?.setupSvelte3 === 'function') {
        await generatedSetup.setupSvelte3({
          app,
          story: props.story,
          variant: props.variant,
        })
      }

      if (typeof setup?.setupSvelte3 === 'function') {
        await setup.setupSvelte3({
          app,
          story: props.story,
          variant: props.variant,
        })
      }

      if (typeof props.variant.setupApp === 'function') {
        await props.variant.setupApp({
          app,
          story: props.story,
          variant: props.variant,
        })
      }

      emit('ready')
    }

    function unmountStory () {
      app?.$destroy()
      if (target) {
        target.parentNode?.removeChild(target)
        target = null
      }
      tearDownHandlers.forEach(fn => fn())
      tearDownHandlers = []
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

  render () {
    return _h('div', {
      ref: 'el',
    })
  },
})
