import { parseQuery } from 'vue-router'
import { computed, createApp, h, onMounted, ref, watch } from 'vue'
import { createPinia } from 'pinia'
import { applyStateToVariant } from '@histoire/shared'
import { SandboxVue3, MountStoryVue3 } from '@histoire/plugin-vue/client'
import type { StoryFile } from './types'
import { mapFile } from './util/mapping'
// @ts-expect-error virtual module
import { files } from '$histoire-stories'
import { PREVIEW_SETTINGS_SYNC, STATE_SYNC, SANDBOX_READY } from './util/const.js'
import { applyPreviewSettings } from './util/preview-settings.js'
import { isDark } from './util/dark.js'
import { histoireConfig } from './util/config.js'
import { toRawDeep } from './util/state.js'

const query = parseQuery(window.location.search)
const file = ref<StoryFile>(mapFile(files.find(f => f.id === query.storyId)))

const app = createApp({
  name: 'SandboxApp',

  setup () {
    const story = computed(() => file.value.story)
    const variant = computed(() => story.value?.variants.find(v => v.id === query.variantId))

    let synced = false
    let mounted = false

    window.addEventListener('message', event => {
      if (event.data?.type === STATE_SYNC) {
        if (!mounted) return
        synced = true
        applyStateToVariant(variant.value, event.data.state)
      } else if (event.data?.type === PREVIEW_SETTINGS_SYNC) {
        applyPreviewSettings(event.data.settings)
      }
    })

    watch(() => variant.value.state, value => {
      if (synced && mounted) {
        synced = false
        return
      }
      window.parent?.postMessage({
        type: STATE_SYNC,
        state: toRawDeep(value),
      })
    }, {
      deep: true,
    })

    onMounted(() => {
      mounted = true
    })

    return {
      story,
      variant,
    }
  },

  render () {
    return [
      h('div', { class: 'htw-sandbox-hidden' }, [
        h(MountStoryVue3, {
          story: file.value.story,
        }),
      ]),
      this.story && this.variant
        ? h(SandboxVue3, {
          story: this.story,
          variant: this.variant,
          onReady: () => {
            window.parent?.postMessage({
              type: SANDBOX_READY,
            })
          },
        })
        : null,
    ]
  },
})
app.use(createPinia())
app.mount('#app')

watch(isDark, value => {
  if (value) {
    document.documentElement.classList.add(histoireConfig.sandboxDarkClass)
  } else {
    document.documentElement.classList.remove(histoireConfig.sandboxDarkClass)
  }
}, {
  immediate: true,
})
