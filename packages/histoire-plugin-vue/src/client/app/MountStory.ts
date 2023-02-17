/* eslint-disable vue/one-component-per-file */

import { App, createApp, h, Suspense } from 'vue'
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
    let app: App

    async function mountStory () {
      app = createApp({
        name: 'MountStorySubApp',

        render: () => {
          return h(Suspense, [
            h(props.story.file.component, {
              story: props.story,
            }),
          ])
        },
      })

      registerGlobalComponents(app)

      // Stubs
      app.component('RouterLink', RouterLinkStub)

      // Force update (story is not reactive for user's vue)
      _watch(() => props.story.variants, () => {
        app._instance.proxy.$forceUpdate()
      })

      // Call app setups to resolve global assets such as components

      if (typeof generatedSetup?.setupVue3 === 'function') {
        await generatedSetup.setupVue3({
          app,
          story: props.story,
          variant: null,
        })
      }

      if (typeof setup?.setupVue3 === 'function') {
        await setup.setupVue3({
          app,
          story: props.story,
          variant: null,
        })
      }

      const target = document.createElement('div')
      el.value.appendChild(target)
      app.mount(target)
    }

    function unmountStory () {
      app?.unmount()
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
