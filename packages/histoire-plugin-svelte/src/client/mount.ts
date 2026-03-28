import type { Story } from '@histoire/shared'
import type {
  PropType as _PropType,
} from '@histoire/vendors/vue'
import type { SvelteStorySetupApi } from '../helpers.js'
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
  mountSvelteComponent,
} from '../util/svelte.js'
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

  setup(props) {
    const el = _ref<HTMLDivElement>()
    let app: any
    let target: HTMLDivElement
    let destroyApp: (() => void) | null = null

    async function mountStory() {
      target = document.createElement('div')
      el.value.appendChild(target)

      const mountedApp = await mountSvelteComponent(props.story.file.component, {
        target,
        props: {
          Hst: {
            Story: MountStorySvelte,
            Variant: MountVariantSvelte,
            ...getControls(),
          },
        },
        context: new Map(Object.entries({
          __hstStory: props.story,
        })),
      }, 'client')
      app = mountedApp.app
      destroyApp = mountedApp.destroy

      const setupApi: SvelteStorySetupApi = {
        app,
        story: props.story,
        variant: null,
      }

      await callSetupFunctions(generatedSetup, setup, setupApi)
    }

    function unmountStory() {
      destroyApp?.()
      destroyApp = null
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
    result[key.substring(3)] = StubComponent
  }
  return result
}
