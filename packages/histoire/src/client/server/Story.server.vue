<script lang="ts">
import { defineComponent, inject, PropType, provide, useAttrs } from 'vue'
import type { StoryFile, Story, Variant } from '../../node/stories'

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
      data: StoryFile
    }

    // Story

    const story: Story = {
      id: attrs.data.id,
      title: props.title,
      layout: props.layout,
      variants: [],
    }
    const addStory = inject('addStory', null)
    addStory?.(story)

    // Variants

    provide('story', story)

    provide('addVariant', (variant: Variant) => {
      story.variants.push(variant)
    })

    return {
      story,
    }
  },

  render () {
    return this.$slots.default()
  },
})
</script>
