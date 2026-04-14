import type { Story, Variant } from '@histoire/shared'
import type { App, Component, PropType, VNode } from 'vue'
import type { Vue3StorySetupApi, Vue3StorySetupHandler } from '../../helpers.js'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  Suspense,
} from 'vue'
import { registerGlobalComponents } from './global-components.js'
import { type PreviewRenderContext, provideRenderContext } from './render-context.js'
import { RouterLinkStub } from './RouterLinkStub'

interface PreviewHostOptions {
  name: string
  el: HTMLElement
  getStory: () => Story
  getVariant: () => Variant | null
  renderContext: PreviewRenderContext
  wrapInDiv?: boolean
}

const PreviewHostRoot = defineComponent({
  name: 'PreviewHostRoot',

  props: {
    story: {
      type: Object as PropType<Story>,
      required: true,
    },

    renderContext: {
      type: Object as PropType<PreviewRenderContext>,
      required: true,
    },
  },

  setup(props) {
    provideRenderContext(props.renderContext)

    return () => h(props.story.file.component, {
      story: props.story,
    })
  },
})

export function createPreviewHost(options: PreviewHostOptions) {
  let app: App = null
  let target: HTMLDivElement = null

  /**
   * Waits for the user Vue app to flush render-time mutations like auto-prop
   * detection before the bundled wrapper reports readiness.
   */
  async function waitForHostRenderSettled() {
    await nextTick()
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }

  async function mount() {
    const wrappers: Component[] = []

    target = document.createElement('div')
    options.el.appendChild(target)

    app = createApp({
      name: options.name,

      render: () => {
        let vnode: VNode = h(PreviewHostRoot, {
          story: options.getStory(),
          renderContext: options.renderContext,
        })

        for (const wrapper of wrappers) {
          const child = vnode
          vnode = h(wrapper, {
            story: options.getStory(),
            variant: options.getVariant(),
          }, () => child)
        }

        if (options.wrapInDiv) {
          vnode = h('div', vnode)
        }

        return h(Suspense, {}, vnode)
      },
    })

    registerGlobalComponents(app)
    app.component('RouterLink', RouterLinkStub)

    const setupApi: Vue3StorySetupApi = {
      app,
      story: options.getStory(),
      variant: options.getVariant(),
      addWrapper: (wrapper) => {
        wrappers.unshift(wrapper)
      },
    }

    await runSetupHooks(setupApi)

    app.mount(target)
    await waitForHostRenderSettled()
  }

  function unmount() {
    app?.unmount()
    app = null

    if (target) {
      target.parentNode?.removeChild(target)
      target = null
    }
  }

  function forceUpdate() {
    app?._instance?.proxy?.$forceUpdate()
  }

  return {
    mount,
    unmount,
    forceUpdate,
  }
}

async function runSetupHooks(setupApi: Vue3StorySetupApi) {
  if (typeof generatedSetup?.setupVue3 === 'function') {
    const setupFn = generatedSetup.setupVue3 as Vue3StorySetupHandler
    await setupFn(setupApi)
  }

  if (typeof setup?.setupVue3 === 'function') {
    const setupFn = setup.setupVue3 as Vue3StorySetupHandler
    await setupFn(setupApi)
  }

  if (typeof setupApi.variant?.setupApp === 'function') {
    const setupFn = setupApi.variant.setupApp as Vue3StorySetupHandler
    await setupFn(setupApi)
  }
}
