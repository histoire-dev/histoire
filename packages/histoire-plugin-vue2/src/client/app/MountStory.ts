/* eslint-disable vue/one-component-per-file */

import Vue, { h } from 'vue'
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
import * as setup from '$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from '$histoire-generated-global-setup'
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

        provide: {
          hstStory: props.story,
        },

        render: () => {
          return h(props.story.file.component)
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
