import type { Story, Variant } from '@histoire/shared'
import type { App, Component, PropType, VNode } from 'vue'
import type { Vue3StorySetupApi, Vue3StorySetupHandler } from '../../helpers.js'
import { registerHistoireGlobalsAdapter, registerStoryExecutionTargetResolver, useHistoireGlobals, withStoryExecution } from '@histoire/shared'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
import {
  createApp,
  defineComponent,
  getCurrentInstance,
  h,
  nextTick,
  reactive,
  Suspense,
} from 'vue'
import { registerGlobalComponents } from './global-components.js'
import { type PreviewRenderContext, provideRenderContext } from './render-context.js'
import { RouterLinkStub } from './RouterLinkStub'

// Reads story app's Vue instance, never Histoire's separate vendor Vue instance.
registerStoryExecutionTargetResolver('vue', () => (getCurrentInstance()?.appContext.app as any)?.__HST_STORY_MOUNT_TARGET__)

const runtimeGlobals = reactive({})
registerHistoireGlobalsAdapter(() => runtimeGlobals, (value) => {
  for (const key of Object.keys(runtimeGlobals)) {
    if (!Object.hasOwn(value, key)) delete runtimeGlobals[key]
  }
  Object.assign(runtimeGlobals, value)
})

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

/** Own isolated story app and publish readiness after first root Suspense resolves. */
export function createPreviewHost(options: PreviewHostOptions) {
  let app: App = null
  let target: HTMLDivElement = null
  let retireMount: (() => void) | undefined

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
    let resolveRoot: () => void
    let rejectRoot: (error: Error) => void
    // Suspense can resolve synchronously inside app.mount; install waiter first.
    const rootReady = new Promise<void>((resolve, reject) => {
      resolveRoot = resolve
      rejectRoot = reject
    })
    void rootReady.catch(() => {})
    /** Observe retirement even before asynchronous root setup finishes. */
    const retire = () => rejectRoot(new Error('Preview host retired during mounting'))
    retireMount = retire

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

        return h(Suspense, { onResolve: resolveRoot }, vnode)
      },
    })
    const ownerApp = app
    const ownerTarget = target
    ;(ownerApp as any).__HST_STORY_MOUNT_TARGET__ = ownerTarget
    /** Late setup/mount hooks cannot mount or publish a replacement owner. */
    function assertOwner() {
      if (app !== ownerApp || target !== ownerTarget) throw new Error('Preview host retired during mounting')
    }

    registerGlobalComponents(app)
    app.component('RouterLink', RouterLinkStub)

    const setupApi: Vue3StorySetupApi = {
      app,
      globals: useHistoireGlobals(),
      story: options.getStory(),
      variant: options.getVariant(),
      addWrapper: (wrapper) => {
        wrappers.unshift(wrapper)
      },
    }

    try {
      await runSetupHooks(setupApi)
      assertOwner()
      await (ownerApp as any).__HST_NUXT_LIFECYCLE__?.('app:beforeMount')
      assertOwner()

      // Registration remains attributed to this exact app during synchronous
      // mount; readiness waits actual async setup and Nuxt head/plugin hooks.
      withStoryExecution(() => ownerApp.mount(ownerTarget), ownerTarget)
      await rootReady
      assertOwner()
      await (ownerApp as any).__HST_NUXT_LIFECYCLE__?.('app:mounted')
      assertOwner()
      await (ownerApp as any).__HST_NUXT_LIFECYCLE__?.('app:suspense:resolve')
      assertOwner()
      await waitForHostRenderSettled()
      assertOwner()
      if (retireMount === retire) retireMount = undefined
    }
    catch (error) {
      // Nuxt/plugin setup may allocate effects before app ever mounts.
      if (app === ownerApp) unmount()
      // Imports may finish after prior unmount and register new scoped resources
      // on retired app. Release captured owner, never replacement app.
      else cleanupApp(ownerApp)
      throw error
    }
  }

  /** Close exactly one app, including resources acquired after early retirement. */
  function cleanupApp(owner: App) {
    ;(owner as any)?.__HST_NUXT_CLEANUP__?.()
    if (owner?._container) owner.unmount()
  }

  function unmount() {
    retireMount?.()
    retireMount = undefined
    cleanupApp(app)
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
    await callSetupHook(setupFn, setupApi)
  }

  if (typeof setup?.setupVue3 === 'function') {
    const setupFn = setup.setupVue3 as Vue3StorySetupHandler
    await callSetupHook(setupFn, setupApi)
  }

  if (typeof setupApi.variant?.setupApp === 'function') {
    const setupFn = setupApi.variant.setupApp as Vue3StorySetupHandler
    await callSetupHook(setupFn, setupApi)
  }
}

/** Nuxt context follows actual app for user and variant setup hooks. */
function callSetupHook(handler: Vue3StorySetupHandler, setupApi: Vue3StorySetupApi) {
  const invoke = () => withStoryExecution(() => handler(setupApi), (setupApi.app as any).__HST_STORY_MOUNT_TARGET__)
  const scoped = (setupApi.app as any).__HST_NUXT_SETUP_CONTEXT__
  if (scoped) return scoped(invoke)
  const nuxt = (setupApi.app as any).$nuxt
  return nuxt?.runWithContext ? nuxt.runWithContext(invoke) : invoke()
}
