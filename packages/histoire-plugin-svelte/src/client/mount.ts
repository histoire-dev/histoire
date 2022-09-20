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
import type { Story } from '@histoire/shared'
import { components } from '@histoire/controls'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
import MountStorySvelte from './MountStory.svelte'
import MountVariantSvelte from './MountVariant.svelte'
import StubComponent from './Stub.svelte'

export default _defineComponent({
  name: 'MountStory',

  props: {
    story: {
      type: Object as _PropType<Story>,
      required: true,
    },
  },

  setup (props) {
    const el = _ref<HTMLDivElement>()
    let app: SvelteComponent
    let target: HTMLDivElement

    async function mountStory () {
      target = document.createElement('div')
      el.value.appendChild(target)

      // eslint-disable-next-line new-cap
      app = new props.story.file.component({
        target,
        props: {
          Hst: {
            // @ts-ignore
            Story: MountStorySvelte,
            // @ts-ignore
            Variant: MountVariantSvelte,
            ...getControls(),
          },
        },
        context: new Map(Object.entries({
          __hstStory: props.story,
        })),
      })

      // Call app setups to resolve global assets such as components

      if (typeof generatedSetup?.setupSvelte3 === 'function') {
        await generatedSetup.setupSvelte3({
          app,
          story: props.story,
          variant: null,
        })
      }

      if (typeof setup?.setupSvelte3 === 'function') {
        await setup.setupSvelte3({
          app,
          story: props.story,
          variant: null,
        })
      }
    }

    function unmountStory () {
      app?.$destroy()
      if (target) {
        target.parentNode?.removeChild(target)
        target = null
      }
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

function getControls () {
  const result: Record<string, any> = {}
  for (const key in components) {
    result[key.substring(3)] = StubComponent
  }
  return result
}
