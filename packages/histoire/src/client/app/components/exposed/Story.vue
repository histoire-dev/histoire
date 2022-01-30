<script lang="ts">
import { defineComponent, onBeforeMount, onBeforeUnmount, PropType, provide, ref, useAttrs } from 'vue'
import { useStoryStore } from '../../stores/story.js'
import { Story, Variant } from '../../types.js'

export default defineComponent({
  inheritAttrs: false,

  props: {
    title: {
      type: String,
      required: true,
    },

    layout: {
      type: Object as PropType<Story['layout']>,
      default: () => ({ type: 'single' }),
    },
  },

  setup (props) {
    const attrs = useAttrs() as {
      data: {
        id: string
        reloadHandlers: (() => unknown)[]
      }
    }

    // Story

    const storyStore = useStoryStore()

    const story = ref<Story>(null)

    onBeforeMount(() => {
      story.value = storyStore.addStory({
        id: attrs.data.id,
        title: props.title,
        layout: props.layout,
        variants: [],
        mountTime: Date.now(),
      })
    })

    onBeforeUnmount(() => {
      storyStore.removeStory(story.value)
    })

    // Variants

    provide('story', story)

    provide('addVariant', (variant: Variant) => {
      story.value.variants.push(variant)
    })

    provide('removeVariant', (variant: Variant) => {
      const index = story.value.variants.indexOf(variant)
      if (index !== -1) {
        story.value.variants.splice(index, 1)
      }
    })

    return {
      story,
    }
  },

  render () {
    Object.assign(this.story, {
      title: this.title,
      layout: this.layout,
    })
    return this.$slots.default()
  },
})
</script>
