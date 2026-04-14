import type { Context } from '../context.js'
import { createRequire } from 'node:module'
import { hasProjectVitest } from '../util/has-vitest.js'
import { resolveHistoireSharedEntry } from '../util/resolve-histoire-shared.js'
import { tryResolveVitestModule } from '../util/resolve-vitest-package.js'

const require = createRequire(import.meta.url)

export function previewRuntime(ctx: Context) {
  const histoireSharedId = resolveHistoireSharedEntry()
  const variantTestSessionId = require.resolve('./variant-test-session.js')
  const hasVitest = hasProjectVitest(ctx.root)
  const vitestSpyId = tryResolveVitestModule(ctx.root, '@vitest/spy')
  const vitestMockerBrowserId = tryResolveVitestModule(ctx.root, '@vitest/mocker/browser')
  const hasVitestPreview = hasVitest && vitestSpyId && vitestMockerBrowserId
  const files = ctx.storyFiles
    .filter(file => !!file.story)
    .map(file => ({
      id: file.id,
      path: file.treePath,
      filePath: file.relativePath,
      docsFilePath: file.markdownFile?.relativePath,
      supportPluginId: file.supportPluginId,
      story: file.story,
      moduleId: file.moduleId,
    }))
  const loaders = files.map(file => `'${file.id}': () => import(${JSON.stringify(file.moduleId)})`)

  return `
import '@histoire/app/dist/bundled/util/vitest-mocker-shim.js'
import 'virtual:$histoire-theme'
${hasVitestPreview
  ? `import { createMockInstance } from ${JSON.stringify(vitestSpyId)}
import { ModuleMocker, ModuleMockerMSWInterceptor, ModuleMockerServerInterceptor } from ${JSON.stringify(vitestMockerBrowserId)}`
  : ''}
import FloatingVue from '@histoire/vendors/floating-vue'
import { createPinia } from '@histoire/vendors/pinia'
import { computed, createApp, defineComponent, h, nextTick, onMounted, reactive, ref, watch } from '@histoire/vendors/vue'
import StoryVariantGridSandbox from '@histoire/app/dist/bundled/components/story/StoryVariantGridSandbox.vue.js'
import GenericMountStory from '@histoire/app/dist/bundled/components/story/GenericMountStory.vue.js'
import GenericRenderStory from '@histoire/app/dist/bundled/components/story/GenericRenderStory.vue.js'
import { setupPluginApi } from '@histoire/app/dist/bundled/plugin.js'
import { usePreviewSettingsStore } from '@histoire/app/dist/bundled/stores/preview-settings.js'
import { COLLECT_TESTS, PREVIEW_SETTINGS_SYNC, PREVIEW_SYNC, RUN_TESTS, SANDBOX_READY, SELECT_VARIANT, STATE_SYNC, TEST_DEFINITIONS, TEST_RESULT, VARIANT_READY } from '@histoire/app/dist/bundled/util/const.js'
import { histoireConfig } from '@histoire/app/dist/bundled/util/config.js'
import { isDark } from '@histoire/app/dist/bundled/util/dark.js'
import { mapFile } from '@histoire/app/dist/bundled/util/mapping.js'
import { applyPreviewSettings } from '@histoire/app/dist/bundled/util/preview-settings.js'
import { toRawDeep } from '@histoire/app/dist/bundled/util/state.js'
import { applyVariantStateUpdate, createHistoireTestSummary, createVariantStateSyncGuards, getVariantStateKey, serializeTestError } from ${JSON.stringify(histoireSharedId)}
import { createVariantTestSession } from ${JSON.stringify(variantTestSessionId)}

const TEST_DEFINITIONS_KEY = '__HST_TEST_DEFINITIONS__'
const STORY_CHANGED_EVENT = 'histoire:story-changed'
const files = ${JSON.stringify(files)}
const moduleLoaders = {
  ${loaders.join(',\n  ')}
}
const storyFileCache = new Map()
const initialSelection = {
  storyId: new URLSearchParams(window.location.search).get('storyId'),
  variantId: new URLSearchParams(window.location.search).get('variantId'),
  grid: new URLSearchParams(window.location.search).get('grid') === 'true',
}

setupPluginApi()

function hotRpc(event, data) {
  const hot = import.meta.hot
  if (!hot) {
    throw new Error('Vitest mock RPC is unavailable without Vite HMR.')
  }

  hot.send(event, data)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      hot.off(\`\${event}:result\`, onResult)
      reject(new Error(\`Failed to resolve \${event} in time\`))
    }, 5_000)

    function onResult(result) {
      clearTimeout(timeout)
      hot.off(\`\${event}:result\`, onResult)
      resolve(result)
    }

    hot.on(\`\${event}:result\`, onResult)
  })
}

function registerNativeFactoryResolver(mocker) {
  const hot = import.meta.hot
  if (!hot) {
    return
  }

  hot.on('vitest:interceptor:resolve', async url => {
    const exports = await mocker.resolveFactoryModule(url)
    hot.send('vitest:interceptor:resolved', {
      url,
      keys: Object.keys(exports),
    })
  })
}

function enableManualMockPreload(mocker) {
  const originalQueueMock = mocker.queueMock.bind(mocker)

  mocker.queueMock = (rawId, importer, factoryOrOptions) => {
    originalQueueMock(rawId, importer, factoryOrOptions)

    if (typeof factoryOrOptions !== 'function') {
      return
    }

    const pendingRegistration = Array.from(mocker.queue).at(-1)
    if (!pendingRegistration) {
      return
    }

    const preloadPromise = pendingRegistration.then(async () => {
      for (const mockUrl of mocker.registry.keys()) {
        const mock = mocker.registry.get(mockUrl)
        if (mock?.type === 'manual' && !mock.cache) {
          await mock.resolve()
        }
      }
    }).finally(() => {
      mocker.queue.delete(preloadPromise)
    })

    mocker.queue.add(preloadPromise)
  }
}

async function ensureVitestPreviewEnvironment() {
  if (!${JSON.stringify(Boolean(hasVitestPreview))}) {
    return
  }

  globalThis.vi ??= {}
  globalThis.vitest ??= globalThis.vi

  globalThis.__vitest_worker__ ??= {
    config: {
      browser: {
        isolate: false,
        trackUnhandledErrors: false,
      },
      expect: {},
    },
    providedContext: {},
    filepath: '',
    current: null,
    ctx: {},
    metaEnv: import.meta.env,
    onCancel: () => {},
    onFilterStackTrace: stack => stack || '',
  }

  globalThis.__vitest_browser_runner__ ??= {
    provider: 'preview',
    sessionId: 'histoire-preview',
    cleanups: [],
    config: globalThis.__vitest_worker__.config,
    viteConfig: {
      root: '/',
    },
    commands: {
      triggerCommand() {
        throw new Error('Vitest browser commands are not available in Histoire preview runtime.')
      },
    },
    wrapModule(loader) {
      return Promise.resolve().then(loader)
    },
    wrapDynamicImport(loader) {
      return globalThis.__vitest_mocker__?.wrapDynamicImport
        ? globalThis.__vitest_mocker__.wrapDynamicImport(loader)
        : loader()
    },
  }

  if (typeof globalThis.__vitest_mocker__?.queueMock === 'function') {
    return
  }

  if (import.meta.hot) {
    const mocker = new ModuleMocker(
      new ModuleMockerServerInterceptor(),
      {
        resolveId(id, importer) {
          return hotRpc('vitest:mocks:resolveId', { id, importer })
        },
        resolveMock(id, importer, options) {
          return hotRpc('vitest:mocks:resolveMock', { id, importer, options })
        },
        async invalidate(ids) {
          await hotRpc('vitest:mocks:invalidate', { ids })
        },
      },
      createMockInstance,
      { root: '/' },
    )
    enableManualMockPreload(mocker)
    globalThis.__vitest_mocker__ = mocker
    registerNativeFactoryResolver(mocker)
    return
  }

  const mocker = new ModuleMocker(
    new ModuleMockerMSWInterceptor({
      globalThisAccessor: '"__vitest_mocker__"',
    }),
    {
      async resolveId() {
        return null
      },
      async resolveMock() {
        throw new Error('Static Vitest mocks are not available in the Histoire preview build yet.')
      },
      async invalidate() {},
    },
    createMockInstance,
    { root: '/' },
  )
  globalThis.__vitest_mocker__ = mocker
}

function postToParent(payload) {
  let targetOrigin = '*'
  if (document.referrer) {
    try {
      targetOrigin = new URL(document.referrer).origin
    }
    catch {}
  }

  window.parent?.postMessage({
    __histoire: true,
    ...payload,
  }, targetOrigin)
}

function renderRuntimeError(error) {
  const message = error instanceof Error
    ? (error.stack ?? error.message)
    : String(error)

  document.body.innerHTML = ''
  const pre = document.createElement('pre')
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.padding = '16px'
  pre.style.fontFamily = 'monospace'
  pre.style.fontSize = '12px'
  pre.style.color = '#fca5a5'
  pre.style.background = '#111827'
  pre.textContent = message
  document.body.appendChild(pre)
}

window.addEventListener('error', event => {
  renderRuntimeError(event.error ?? event.message)
})

window.addEventListener('unhandledrejection', event => {
  renderRuntimeError(event.reason)
})

function runWithVitestDynamicImport(loader) {
  const runner = globalThis.__vitest_browser_runner__
  const wrapDynamicImport = runner?.wrapDynamicImport
  return typeof wrapDynamicImport === 'function' ? wrapDynamicImport(loader) : loader()
}

const variantTestSession = createVariantTestSession({
  files,
  moduleLoaders,
  runWithDynamicImport: runWithVitestDynamicImport,
  ensureEnvironment: ensureVitestPreviewEnvironment,
})

function getSerializedFile(storyId) {
  const file = files.find(item => item.id === storyId)
  if (!file) {
    throw new Error(\`Unknown histoire story "\${storyId}"\`)
  }
  return file
}

function clearRuntimeTestDefinitions() {
  globalThis[TEST_DEFINITIONS_KEY] = []
}

function setCollectedTestDefinitions(definitions) {
  globalThis[TEST_DEFINITIONS_KEY] = definitions
}

/**
 * Clears the preview-side caches for a story after a hot update so future test
 * collection reloads the story module instead of serving stale registrations.
 */
function invalidateStoryRuntime(storyId) {
  storyFileCache.delete(storyId)
  variantTestSession.invalidateStory(storyId)

  if (selectionState.storyId === storyId) {
    clearRuntimeTestDefinitions()
  }
}

async function loadStoryFile(storyId, { useCache = true } = {}) {
  await ensureVitestPreviewEnvironment()

  if (useCache && storyFileCache.has(storyId)) {
    return storyFileCache.get(storyId)
  }

  const file = getSerializedFile(storyId)
  const loadModule = moduleLoaders[storyId]
  if (!loadModule) {
    throw new Error(\`Missing histoire story module loader for "\${storyId}"\`)
  }

  let mappedFile
  const module = await runWithVitestDynamicImport(loadModule)
  mappedFile = mapFile({
    ...file,
    component: module.default,
    source: async () => ({ default: '' }),
  })

  if (useCache) {
    storyFileCache.set(storyId, mappedFile)
  }

  return mappedFile
}

function summarizeRunError(storyId, variantId, error) {
  return createHistoireTestSummary(storyId, variantId, [{
    name: 'run',
    state: 'failed',
    errors: [serializeTestError(error)],
  }])
}

function postVariantStateSnapshotById(story, variantId) {
  const variant = story?.variants.find(item => item.id === variantId)
  if (!variant) {
    return
  }

  postToParent({
    type: STATE_SYNC,
    variantId: variant.id,
    state: toRawDeep(variant.state, true),
  })
}

function postVariantStateSnapshot(variant) {
  if (!variant) {
    return
  }

  postVariantStateSnapshotById({
    variants: [variant],
  }, variant.id)
}

async function runVariantTests(storyFile, variant) {
  return await variantTestSession.runVariantTests(storyFile.id, variant.id)
}

const selectionState = {
  storyId: initialSelection.storyId,
}

if (import.meta.hot) {
  import.meta.hot.on(STORY_CHANGED_EVENT, ({ storyId }) => {
    if (!storyId) {
      return
    }

    invalidateStoryRuntime(storyId)
  })
}

const PreviewTestCapture = defineComponent({
  name: 'PreviewTestCapture',
  props: {
    story: {
      type: Object,
      required: true,
    },
    variant: {
      type: Object,
      required: true,
    },
  },
  emits: {
    ready: () => true,
  },
  setup(props, { emit }) {
    function onReady() {
      emit('ready')
    }

    return () => [
      h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
        story: props.story,
      })]),
      h('div', {
        class: '__histoire-preview-canvas',
        'data-histoire-variant-id': props.variant.id,
        'data-test-id': 'sandbox-render',
      }, [h(GenericRenderStory, {
        story: props.story,
        variant: props.variant,
        onReady,
      })]),
    ]
  },
})

const root = document.createElement('div')
root.id = 'app'
document.body.innerHTML = ''
document.body.appendChild(root)

const app = createApp({
  name: 'VitestPreviewRuntime',
  setup() {
    const file = ref(null)
    const selection = reactive({ storyId: null, variantId: null, grid: false })
    const gridSelectedVariantId = ref(null)
    const previewSettingsStore = usePreviewSettingsStore()
    let mounted = false
    let selectionToken = 0
    const variantStateGuards = createVariantStateSyncGuards()
    const variantStateWatchStops = new Map()
    const story = computed(() => file.value?.story ?? null)
    const variant = computed(() => {
      const variantId = selection.grid ? (gridSelectedVariantId.value ?? selection.variantId) : selection.variantId
      return story.value?.variants.find(item => item.id === variantId) ?? null
    })

    function getVariantById(variantId) {
      return story.value?.variants.find(item => item.id === variantId) ?? null
    }

    function stopVariantStateWatchers() {
      for (const stop of variantStateWatchStops.values()) {
        stop()
      }

      variantStateWatchStops.clear()
      variantStateGuards.reset()
    }

    function syncVariantStateWatchers(nextStory) {
      stopVariantStateWatchers()

      if (!nextStory) {
        return
      }

      for (const targetVariant of nextStory.variants) {
        const key = getVariantStateKey(nextStory.id, targetVariant.id)
        if (!key) {
          continue
        }

        const stop = watch(() => targetVariant.state, value => {
          if (variantStateGuards.consume(key)) {
            return
          }

          postToParent({
            type: STATE_SYNC,
            variantId: targetVariant.id,
            state: toRawDeep(value, true),
          })
        }, {
          deep: true,
          flush: 'sync',
        })

        variantStateWatchStops.set(key, stop)
      }
    }

    async function waitForVariantSnapshot() {
      await nextTick()
      await nextTick()
      await new Promise(resolve => requestAnimationFrame(resolve))
    }

    async function syncSelection(nextSelection) {
      const token = ++selectionToken
      selection.storyId = nextSelection.storyId ?? null
      selectionState.storyId = selection.storyId
      selection.variantId = nextSelection.variantId ?? null
      selection.grid = !!nextSelection.grid
      gridSelectedVariantId.value = nextSelection.variantId ?? null
      clearRuntimeTestDefinitions()
      if (!selection.storyId) {
        stopVariantStateWatchers()
        file.value = null
        return
      }

      const nextFile = await loadStoryFile(selection.storyId)
      if (selectionToken === token) {
        file.value = nextFile
        syncVariantStateWatchers(nextFile.story)
        await nextTick()
      }
    }

    window.addEventListener('message', async (event) => {
      if (event.data?.type === PREVIEW_SYNC) {
        await syncSelection(event.data)
        postVariantStateSnapshot(variant.value)
        postToParent({ type: SANDBOX_READY, variantId: variant.value?.id })
      }
      else if (event.data?.type === STATE_SYNC) {
        if (mounted) {
          applyVariantStateUpdate({
            storyId: story.value?.id ?? selection.storyId,
            variantId: event.data.variantId,
            state: event.data.state,
            getVariantById,
            guards: variantStateGuards,
          })
        }
      }
      else if (event.data?.type === PREVIEW_SETTINGS_SYNC) {
        if (selection.grid) {
          Object.assign(previewSettingsStore.currentSettings, event.data.settings)
        }
        else {
          applyPreviewSettings(event.data.settings)
        }
      }
      else if (event.data?.type === SELECT_VARIANT) {
        gridSelectedVariantId.value = event.data.variantId
      }
      else if (event.data?.type === COLLECT_TESTS) {
        const requestId = event.data?.requestId
        const variantKey = event.data?.variantKey

        if (!story.value || !variant.value) {
          setCollectedTestDefinitions([])
          postToParent({
            type: TEST_DEFINITIONS,
            requestId,
            variantKey,
            definitions: [],
          })
          return
        }

        try {
          const definitions = await variantTestSession.collectVariantTests(story.value.id, variant.value.id)
          setCollectedTestDefinitions(definitions)
          postToParent({
            type: TEST_DEFINITIONS,
            requestId,
            variantKey,
            definitions,
          })
        }
        catch (error) {
          console.error(error)
          setCollectedTestDefinitions([])
          postToParent({
            type: TEST_DEFINITIONS,
            requestId,
            variantKey,
            definitions: [],
          })
        }
      }
      else if (event.data?.type === RUN_TESTS) {
        const variantKey = event.data?.variantKey
        if (!story.value || !variant.value) {
          postToParent({
            type: TEST_RESULT,
            runId: event.data.runId,
            variantKey,
            summary: summarizeRunError('unknown', 'unknown', new Error('Could not run tests. No active story/variant is selected.')),
          })
          return
        }

        try {
          const summary = await runVariantTests(story.value, variant.value)
          postToParent({ type: TEST_RESULT, runId: event.data.runId, variantKey, summary })
        }
        catch (error) {
          postToParent({
            type: TEST_RESULT,
            runId: event.data.runId,
            variantKey,
            summary: summarizeRunError(story.value.id, variant.value.id, error),
          })
        }
      }
    })

    onMounted(() => {
      mounted = true
      if (initialSelection.storyId) {
        void syncSelection(initialSelection).then(() => {
          postToParent({ type: SANDBOX_READY, variantId: variant.value?.id })
        })
      }
      postToParent({ type: SANDBOX_READY, variantId: variant.value?.id })
    })

    return {
      file,
      story,
      variant,
      selection,
      selectGridVariant(variantId) {
        gridSelectedVariantId.value = variantId
        postToParent({ type: SELECT_VARIANT, variantId })
      },
      async markVariantReady(variantId) {
        await waitForVariantSnapshot()
        postVariantStateSnapshotById(story.value, variantId)
        postToParent({ type: VARIANT_READY, variantId })
      },
      async syncMountedStoryVariants() {
        await waitForVariantSnapshot()

        for (const targetVariant of story.value?.variants ?? []) {
          postVariantStateSnapshotById(story.value, targetVariant.id)
        }
      },
    }
  },
  render() {
    if (!this.story) {
      return null
    }

    return [
      this.selection.grid
        ? h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
          key: this.story.id,
          story: this.story,
          onReady: this.syncMountedStoryVariants,
        })])
        : null,
      this.selection.grid
        ? h(StoryVariantGridSandbox, {
          story: this.story,
          variant: this.variant,
          onSelect: this.selectGridVariant,
          onReady: this.markVariantReady,
        })
        : this.variant
          ? h(PreviewTestCapture, {
            story: this.story,
            variant: this.variant,
            onReady: () => this.markVariantReady(this.variant.id),
          })
          : null,
    ]
  },
})

app.use(createPinia())
app.use(FloatingVue, {
  overflowPadding: 4,
  arrowPadding: 8,
  themes: {
    tooltip: { distance: 8 },
    dropdown: { computeTransformOrigin: true, distance: 8 },
  },
})
app.mount(root)

watch(isDark, value => {
  document.documentElement.classList.toggle(histoireConfig.sandboxDarkClass, value)
  document.documentElement.classList.toggle(histoireConfig.theme.darkClass, value)
}, {
  immediate: true,
})
`
}
