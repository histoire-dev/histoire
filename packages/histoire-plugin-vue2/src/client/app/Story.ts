import { defineComponent, provide, VNode, h, PropType, getCurrentInstance, reactive, inject } from 'vue'
import { Story, omitInheritStoryProps } from '@histoire/shared'
import Variant from './Variant'

export default Object.assign(defineComponent({
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Story',

  inheritAttrs: false,

  props: {
    initState: {
      type: Function as PropType<() => any | Promise<any>>,
      default: null,
    },
  },

  setup () {
    const vm = getCurrentInstance()

    const story = inject('hstStory') as Story
    provide('story', story)

    const storyComponent: any = vm.proxy.$parent
    // Allows tracking reactivity with watchers to sync state
    const implicitState = {
      $data: storyComponent.data,
    }
    function addImplicitState (key, value) {
      if (typeof value === 'function' || (value?.__file) || typeof value?.render === 'function' || typeof value?.setup === 'function') {
        return
      }
      implicitState[key] = value
    }
    // From `<script setup>`'s `defineExpose`
    for (const key in storyComponent.exposed) {
      addImplicitState(key, storyComponent.exposed[key])
    }
    // We needs __VUE_PROD_DEVTOOLS__ flag set to `true` to enable `devtoolsRawSetupState`
    for (const key in storyComponent._setupState) {
      addImplicitState(key, storyComponent._setupState[key])
    }
    // Shallow copy to prevent sharing object with different variants
    // Wrap with reactive to unwrap refs
    provide('implicitState', () => reactive({ ...implicitState }))

    function updateStory () {
      Object.assign(story, {
        slots: () => vm.proxy.$slots,
      })
    }

    return {
      story,
      updateStory,
    }
  },

  render () {
    this.updateStory()

    const [firstVariant] = this.story.variants
    if (firstVariant.id === '_default') {
      return h(Variant, {
        props: {
          variant: firstVariant,
          // @ts-ignore
          initState: this.initState,
          ...this.$attrs,
        },
      }, this.$slots.default)
    }

    let index = 0
    const applyAttrs = (vnodes: VNode[]) => {
      for (const vnode of vnodes) {
        // @ts-expect-error custom option
        if (vnode.componentOptions?.Ctor?.options?.__histoireType === 'variant') {
          const variant = this.story.variants[index]
          if (!vnode.componentOptions.propsData) {
            vnode.componentOptions.propsData = {}
          }
          // @ts-expect-error object type >.<
          vnode.componentOptions.propsData.variant = variant
          // // @ts-expect-error object type >.<
          // vnode.componentOptions.propsData.variantSynced = this.story.variants[index]
          if (!vnode.data) {
            vnode.data = {}
          }
          if (!vnode.data.attrs) {
            vnode.data.attrs = {}
          }
          if (!vnode.data.attrs.initState && !vnode.data.attrs['init-state']) {
            vnode.data.attrs.initState = this.initState
          }
          for (const attr in this.$attrs) {
            if (typeof vnode.data.attrs[attr] === 'undefined') {
              vnode.data.attrs[attr] = this.$attrs[attr]
            }
          }
          for (const attr in this.story) {
            if (!omitInheritStoryProps.includes(attr) && typeof vnode.data.attrs[attr] === 'undefined') {
              vnode.data.attrs[attr] = this.story[attr]
            }
          }
          vnode.key = variant ? `variant-${variant.id}` : `null-variant-${index}`
          index++
        } else if (vnode.children?.length) {
          applyAttrs(vnode.children as VNode[])
        }
      }
    }

    // Apply variant as attribute to each child vnode (should be `<Variant>` components)
    const vnodes: VNode[] = this.$slots.default
    applyAttrs(vnodes)
    return h('div', vnodes)
  },
}), {
  __histoireType: 'story',
})
