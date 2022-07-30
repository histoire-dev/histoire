import { defineComponent, inject } from 'vue'
import type { ServerStory, ServerVariant } from '@histoire/shared'

export default defineComponent({
  name: 'HistoireVariant',

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
    const story = inject<ServerStory>('story')

    function generateId () {
      return `${story.id}-${story.variants.length}`
    }

    const variant: ServerVariant = {
      id: props.id ?? generateId(),
      title: props.title,
      icon: props.icon,
      iconColor: props.iconColor,
    }

    const addVariant = inject('addVariant') as (variant: ServerVariant) => void
    addVariant(variant)
  },

  render () {
    return null
  },
})
