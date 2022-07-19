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
} from '@histoire/vendors/dist/client/vue'
import type { Story } from '@histoire/shared'
import { registerGlobalComponents } from './global-components.js'
import { RouterLinkStub } from './RouterLinkStub'

export default _defineComponent({
  name: 'MountStoryVue3',

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
        name: 'MountStoryVue3',

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
