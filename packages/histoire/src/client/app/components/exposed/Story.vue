<script lang="ts">
import { computed, defineComponent, provide, useAttrs, VNode, h, PropType } from 'vue'
import { Story } from '../../types.js'
import Variant from './Variant.vue'

export default defineComponent({
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Story',
  __histoireType: 'story',

  inheritAttrs: false,

  props: {
    initState: {
      type: Function as PropType<() => any | Promise<any>>,
      default: null,
    },
  },

  setup () {
    const attrs = useAttrs() as {
      story: Story
    }

    const story = computed(() => attrs.story)
    provide('story', story)

    return {
      story,
    }
  },

  render () {
    const [firstVariant] = this.story.variants
    if (firstVariant.id === '_default') {
      return h(Variant, {
        variant: firstVariant,
        initState: this.initState,
        ...this.$attrs,
      }, this.$slots)
    }

    // Apply variant as attribute to each child vnode (should be `<Variant>` components)
    const vnodes: VNode[] = this.$slots.default()
      // @ts-expect-error custom option
      .filter(vnode => vnode.type?.__histoireType === 'variant')
      // Same number of vnodes as variants
      .slice(0, this.story.variants.length)
    for (const index in vnodes) {
      const vnode = vnodes[index]
      if (!vnode.props) {
        vnode.props = {}
      }
      vnode.props.variant = this.story.variants[index]
      if (!vnode.props.initState && !vnode.props['init-state']) {
        vnode.props.initState = this.initState
      }
    }
    return vnodes
  },
})
</script>
