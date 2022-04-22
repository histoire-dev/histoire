<script lang="ts">
import { computed, defineComponent, provide, useAttrs, VNode, h, PropType, getCurrentInstance } from 'vue'
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

    const storyComponent: any = getCurrentInstance().parent
    // Allows tracking reactivity with watchers to sync state
    const implicitState = {
      $data: storyComponent.data,
    }
    function addImplicitState (key, value) {
      if (typeof value === 'function' || (value && value.__file)) {
        return
      }
      implicitState[key] = value
    }
    // From `<script setup>`'s `defineExpose`
    for (const key in storyComponent.exposed) {
      addImplicitState(key, storyComponent.exposed[key])
    }
    // We needs __VUE_PROD_DEVTOOLS__ flag set to `true` to enable `devtoolsRawSetupState`
    for (const key in storyComponent.devtoolsRawSetupState) {
      addImplicitState(key, storyComponent.devtoolsRawSetupState[key])
    }
    provide('implicitState', () => implicitState)

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

    let index = 0
    const applyAttrs = (vnodes: VNode[]) => {
      for (const vnode of vnodes) {
        // @ts-expect-error custom option
        if (vnode.type?.__histoireType === 'variant') {
          if (!vnode.props) {
            vnode.props = {}
          }
          vnode.props.variant = this.story.variants[index]
          if (!vnode.props.initState && !vnode.props['init-state']) {
            vnode.props.initState = this.initState
          }
          for (const attr in this.$attrs) {
            if (typeof vnode.props[attr] === 'undefined') {
              vnode.props[attr] = this.$attrs[attr]
            }
          }
          index++
        } else if (vnode.children?.length) {
          applyAttrs(vnode.children as VNode[])
        }
      }
    }

    // Apply variant as attribute to each child vnode (should be `<Variant>` components)
    const vnodes: VNode[] = this.$slots.default()
    applyAttrs(vnodes)
    return vnodes
  },
})
</script>
