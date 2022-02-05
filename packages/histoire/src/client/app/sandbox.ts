import { parseQuery } from 'vue-router'
import { computed, createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { registerGlobalComponents } from './global-components'
import SandboxVue3 from './components/sandbox/SandboxVue3.vue'
import { useStoryStore } from './stores/story'
import './style/sandbox.css'
// @ts-expect-error virtual module
import { files } from '$histoire-stories'

const query = parseQuery(window.location.search)
const file = files.find(f => f.id === query.storyId)

const app = createApp({
  setup () {
    const storyStore = useStoryStore()
    const story = computed(() => storyStore.stories[0])
    const variant = computed(() => story.value?.variants.find(v => v.id === query.variantId))
    return {
      story,
      variant,
    }
  },

  render () {
    return [
      h(file.component, {
        data: file,
      }),
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
