<script lang="ts">
import { defineComponent, inject } from 'vue'
import type { Story, Variant } from '../../node/types'

export default defineComponent({
  props: {
    title: {
      type: String,
      default: 'untitled',
    },

    id: {
      type: String,
      default: null,
    },

    icon: {
      type: String,
      default: null,
    },

    iconColor: {
      type: String,
      default: null,
    },
  },

  setup (props) {
    const story = inject<Story>('story')

    function generateId () {
      return `${story.id}-${story.variants.length}`
    }

    const variant: Variant = {
      id: props.id ?? generateId(),
      title: props.title,
      icon: props.icon,
      iconColor: props.iconColor,
    }

    const addVariant = inject('addVariant') as (variant: Variant) => void
    addVariant(variant)
  },

  render () {
    return null
  },
})
</script>
