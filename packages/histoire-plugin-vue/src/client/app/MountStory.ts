import type { Story } from '@histoire/shared'
import type {
  PropType as _PropType,
} from '@histoire/vendors/vue'
import {
  defineComponent as _defineComponent,
  h as _h,
  onMounted as _onMounted,
  onUnmounted as _onUnmounted,
  ref as _ref,
  watch as _watch,
} from '@histoire/vendors/vue'
import { reactive } from 'vue'
import { createPreviewHost } from './host.js'

export default _defineComponent({
  name: 'MountStory',

  props: {
    story: {
      type: Object as _PropType<Story>,
      required: true,
    },
  },

  setup(props) {
    const el = _ref<HTMLDivElement>()
    const renderContext = reactive({
      mode: 'mount' as const,
      slotName: 'default',
      currentVariant: null,
      externalState: null,
      nextVariantIndex: {
        value: 0,
      },
    })
    let host: ReturnType<typeof createPreviewHost>

    async function mountStory() {
      host = createPreviewHost({
        name: 'MountStorySubApp',
        el: el.value,
        getStory: () => props.story,
        getVariant: () => null,
        renderContext,
      })

      await host.mount()
    }

    function unmountStory() {
      host?.unmount()
      host = null
    }

    _watch(() => props.story.id, async () => {
      unmountStory()
      await mountStory()
    })

    _onMounted(async () => {
      await mountStory()
    })

    _watch(() => props.story.variants, () => {
      host?.forceUpdate()
    })

    _onUnmounted(() => {
      unmountStory()
    })

    return {
      el,
    }
  },

  render() {
    return _h('div', {
      ref: 'el',
    })
  },
})
