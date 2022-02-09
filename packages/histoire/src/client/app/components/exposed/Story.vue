<script lang="ts">
import { computed, defineComponent, provide, useAttrs, VNode } from 'vue'
import { Story } from '../../types.js'

export default defineComponent({
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Story',
  __histoireType: 'story',

  inheritAttrs: false,

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
    }
    return vnodes
  },
})
</script>
