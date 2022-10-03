import { defineComponent, inject, onMounted, PropType, provide, useAttrs, h } from 'vue'
import type { ServerStoryFile, ServerStory, ServerVariant } from '@histoire/shared'

const stub = { name: 'StubbedComponent', render: () => null }

function autoStubComponents (vnodes: any[]) {
  for (const vnode of vnodes) {
    if (typeof vnode.type === 'object' && (vnode.type as any).name !== 'HistoireVariant') {
      vnode.type = stub
    }
    if (Array.isArray(vnode.children)) {
      autoStubComponents(vnode.children)
    }
  }
}

export default defineComponent({
  name: 'HistoireStory',

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
      type: Object as PropType<ServerStory['layout']>,
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

    docsOnly: {
      type: Boolean,
      default: false,
    },
  },

  setup (props) {
    const file = inject('htsFile') as ServerStoryFile

    // Story

    const story: ServerStory = {
      id: props.id ?? file.id,
      title: props.title ?? file.fileName,
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

    provide('addVariant', (variant: ServerVariant) => {
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
      // eslint-disable-next-line vue/no-deprecated-dollar-scopedslots-api
      const vnodes = this.$scopedSlots.default?.({
        get state () {
          // No variant tags
          suppressError = true
          return {}
        },
      })

      // @TODO
      // Auto stub components
      // if (Array.isArray(vnodes)) {
      //   autoStubComponents(vnodes)
      // }

      return h('div', vnodes)
    } catch (e) {
      if (!suppressError) {
        console.error(e)
      }
      return null
    }
  },
})
