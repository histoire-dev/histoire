import './style/sandbox.css'
import { parseQuery } from 'vue-router'
import { computed, createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { registerGlobalComponents } from './global-components'
import SandboxVue3 from './components/sandbox/SandboxVue3.vue'
import type { StoryFile } from './types'
import { mapFile } from './util/mapping'
// @ts-expect-error virtual module
import { files } from '$histoire-stories'

const query = parseQuery(window.location.search)
const file = ref<StoryFile>(mapFile(files.find(f => f.id === query.storyId)))

const app = createApp({
  setup () {
    const story = computed(() => file.value.story)
    const variant = computed(() => story.value?.variants.find(v => v.id === query.variantId))
    return {
      story,
      variant,
    }
  },

  render () {
    return [
      h('div', { class: 'htw-sandbox-hidden' }, [
        h(file.value.component, {
          story: file.value.story,
        }),
      ]),
      this.story && this.variant
        ? h(SandboxVue3, {
          story: this.story,
          variant: this.variant,
        })
        : null,
    ]
  },
})
app.use(createPinia())
registerGlobalComponents(app)
app.mount('#app')
