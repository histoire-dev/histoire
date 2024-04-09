import Vue, { h, provide, ref } from 'vue'
import type {
  PropType as _PropType,
} from '@histoire/vendors/vue'
import {
  defineComponent as _defineComponent,
  h as _h,
  onMounted as _onMounted,
  onUnmounted as _onUnmounted,
  ref as _ref,
  watch as _watch,
} from '@histoire/vendors/vue'
import type { Story } from '@histoire/shared'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
import type { Vue2StorySetupApi, Vue2StorySetupHandler } from '../../index.js'
import { registerGlobalComponents } from './global-components.js'
import { RouterLinkStub } from './RouterLinkStub'

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
    let app: Vue

    const forceUpdateKey = ref(0)

    async function mountStory() {
      const wrappers: any[] = []

      // Call app setups to resolve global assets such as components
      const appOptions: Record<string, any> = {}

      const setupApi: Vue2StorySetupApi = {
        story: props.story,
        variant: null,
        addWrapper: (wrapper) => {
          wrappers.push(wrapper)
        },
      }

      if (typeof generatedSetup?.setupVue2 === 'function') {
        const setupFn = generatedSetup.setupVue2 as Vue2StorySetupHandler
        const result = await setupFn(setupApi)
        if (result) {
          Object.assign(appOptions, result)
        }
      }

      if (typeof setup?.setupVue2 === 'function') {
        const setupFn = setup.setupVue2 as Vue2StorySetupHandler
        const result = await setupFn(setupApi)
        if (result) {
          Object.assign(appOptions, result)
        }
      }

      wrappers.reverse()

      app = new Vue({
        name: 'MountStorySubApp',

        setup() {
          provide('hstStory', props.story)
        },

        render: () => {
          if (!props.story.file) return null
          let child = h(props.story.file.component, {
            key: forceUpdateKey.value,
          })

          for (const wrapper of wrappers) {
            child = h(wrapper, {
              props: {
                story: props.story,
              },
            }, [
              child,
            ])
          }

          return child
        },

        ...appOptions,
      })

      registerGlobalComponents(app)

      // Stubs
      Vue.component('RouterLink', RouterLinkStub)

      const target = document.createElement('div')
      el.value.appendChild(target)
      app.$mount(target)
    }

    function unmountStory() {
      app?.$destroy()
    }

    _watch(() => props.story.id, async () => {
      unmountStory()
      await mountStory()
    })

    // Force update on new variants to render them
    _watch(() => props.story.variants.map(v => v.id), () => {
      forceUpdateKey.value++
    }, {
      deep: true,
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
