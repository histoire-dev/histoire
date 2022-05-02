<script lang="ts">
import { defineComponent, inject, onMounted, PropType, provide, useAttrs } from 'vue'
import type { StoryFile, Story, Variant } from '../../node/types'

export default defineComponent({
  inheritAttrs: false,

  props: {
    title: {
      type: String,
      default: null,
    },

    id: {
      type: String,
      default: null,
    },

    group: {
      type: String,
      default: null,
    },

    layout: {
      type: Object as PropType<Story['layout']>,
      default: () => ({ type: 'single' }),
    },

    icon: {
      type: String,
      default: null,
    },

    iconColor: {
      type: String,
      default: null,
    },

    docsOnly: {
      type: Boolean,
      default: false,
    },
  },

  setup (props) {
    const attrs = useAttrs() as {
      data: StoryFile
    }

    // Story

    const story: Story = {
      id: props.id ?? attrs.data.id,
      title: props.title ?? attrs.data.fileName,
      group: props.group,
      layout: props.layout,
      icon: props.icon,
      iconColor: props.iconColor,
      docsOnly: props.docsOnly,
      variants: [],
    }
    const addStory = inject('addStory', null)
    addStory?.(story)

    // Variants

    provide('story', story)

    provide('addVariant', (variant: Variant) => {
      story.variants.push(variant)
    })

    onMounted(() => {
      if (!story.variants.length) {
        story.variants.push({
          id: '_default',
          title: 'default',
        })
      }
    })

    return {
      story,
    }
  },

  render () {
    let suppressError = false
    try {
      return this.$slots.default?.({
        get state () {
          // No variant tags
          suppressError = true
          return {}
        },
      })
    } catch (e) {
      if (!suppressError) {
        console.error(e)
      }
      return null
    }
  },
})
</script>
