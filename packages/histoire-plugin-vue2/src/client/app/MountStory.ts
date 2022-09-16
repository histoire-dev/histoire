/* eslint-disable vue/one-component-per-file */

import Vue, { ref, h, provide } from 'vue'
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
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
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

  setup (props) {
    const el = _ref<HTMLDivElement>()
    let app: Vue

    const forceUpdateKey = ref(0)

    async function mountStory () {
      // Call app setups to resolve global assets such as components
      const appOptions: Record<string, any> = {}

      if (typeof generatedSetup?.setupVue2 === 'function') {
        const result = await generatedSetup.setupVue2({
          story: props.story,
          variant: null,
        })
        if (result) {
          Object.assign(appOptions, result)
        }
      }

      if (typeof setup?.setupVue2 === 'function') {
        const result = await setup.setupVue2({
          story: props.story,
          variant: null,
        })
        if (result) {
          Object.assign(appOptions, result)
        }
      }

      app = new Vue({
        name: 'MountStorySubApp',

        setup () {
          provide('hstStory', props.story)
        },

        render: () => {
          if (!props.story.file) return null
          return h(props.story.file.component, {
            key: forceUpdateKey.value,
          })
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

    function unmountStory () {
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

  render () {
    return _h('div', {
      ref: 'el',
    })
  },
})
