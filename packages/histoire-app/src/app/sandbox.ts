import 'virtual:$histoire-theme'
import { parseQuery } from 'vue-router'
import { computed, createApp, h, onMounted, ref, watch } from 'vue'
import { createPinia } from 'pinia'
import FloatingVue from 'floating-vue'
import { applyState } from '@histoire/shared'
import { files } from 'virtual:$histoire-stories'
import GenericMountStory from './components/story/GenericMountStory.vue'
import GenericRenderStory from './components/story/GenericRenderStory.vue'
import StoryVariantGrid from './components/story/StoryVariantGrid.vue'
import type { StoryFile } from './types'
import { mapFile } from './util/mapping'
import { PREVIEW_SETTINGS_SYNC, SANDBOX_READY, SELECT_VARIANT, STATE_SYNC, VARIANT_READY } from './util/const.js'
import { applyPreviewSettings } from './util/preview-settings.js'
import { isDark } from './util/dark.js'
import { histoireConfig } from './util/config.js'
import { toRawDeep } from './util/state.js'
import { setupPluginApi } from './plugin.js'
import { usePreviewSettingsStore } from './stores/preview-settings.js'

const query = parseQuery(window.location.search)
const file = ref<StoryFile>(mapFile(files.find(f => f.id === query.storyId)))

const app = createApp({
  name: 'SandboxApp',

  setup() {
    const story = computed(() => file.value.story)
    const grid = computed(() => query.grid === 'true')
    const gridSelectedVariantId = ref<string | null>(null)
    const variant = computed(() => story.value?.variants.find(v => v.id === query.variantId || v.id === gridSelectedVariantId.value))

    let synced = false
    let mounted = false

    const previewSettingsStore = usePreviewSettingsStore()

    window.addEventListener('message', (event) => {
      // console.log('[sandbox] received message', event.data)
      if (event.data?.type === STATE_SYNC) {
        if (!mounted) return
        synced = true
        if (!grid.value || variant.value?.id === event.data.variantId) {
          applyState(variant.value.state, event.data.state)
        }
      }
      else if (event.data?.type === PREVIEW_SETTINGS_SYNC) {
        if (grid.value) {
          Object.assign(previewSettingsStore.currentSettings, event.data.settings)
        }
        else {
          applyPreviewSettings(event.data.settings)
        }
      }
      else if (event.data?.type === SELECT_VARIANT) {
        gridSelectedVariantId.value = event.data.variantId
      }
    })

    watch(() => variant.value?.state, (value) => {
      if (synced && mounted) {
        synced = false
        return
      }
      if (!variant.value) return
      window.parent?.postMessage({
        __histoire: true,
        type: STATE_SYNC,
        variantId: variant.value.id,
        state: toRawDeep(value, true),
      })
    }, {
      deep: true,
      flush: 'sync',
    })

    function sendReady() {
      window.parent?.postMessage({
        __histoire: true,
        type: SANDBOX_READY,
        variantId: variant.value?.id,
      })
    }

    onMounted(() => {
      mounted = true

      if (grid.value) {
        sendReady()
      }
    })

    return () => [
      h('div', { class: 'htw-sandbox-hidden' }, [
        h(GenericMountStory, {
          key: file.value.story.id,
          story: file.value.story,
        }),
      ]),
      story.value
        ? grid.value
          ? h(StoryVariantGrid, {
            story: story.value,
            variant: variant.value,
            onSelect: (variantId) => {
              synced = false

              gridSelectedVariantId.value = variantId

              window.parent?.postMessage({
                __histoire: true,
                type: SELECT_VARIANT,
                variantId,
              })
            },
            onReady: (variantId) => {
              window.parent?.postMessage({
                __histoire: true,
                type: VARIANT_READY,
                variantId,
              })
            },
          })
          : variant.value
            ? h(GenericRenderStory, {
              // ref: renderStory,
              story: story.value,
              variant: variant.value,
              onReady: () => {
                sendReady()
              },
            })
            : null
        : null,
    ]
  },
})
app.use(createPinia())
app.use(FloatingVue, {
  overflowPadding: 4,
  arrowPadding: 8,
  themes: {
    tooltip: {
      distance: 8,
    },
    dropdown: {
      computeTransformOrigin: true,
      distance: 8,
    },
  },
})
app.mount('#app')

watch(isDark, (value) => {
  if (value) {
    document.documentElement.classList.add(histoireConfig.sandboxDarkClass) // @TODO remove
    document.documentElement.classList.add(histoireConfig.theme.darkClass)
  }
  else {
    document.documentElement.classList.remove(histoireConfig.sandboxDarkClass) // @TODO remove
    document.documentElement.classList.remove(histoireConfig.theme.darkClass)
  }
}, {
  immediate: true,
})

if (import.meta.hot) {
  /* #__PURE__ */ setupPluginApi()
}
