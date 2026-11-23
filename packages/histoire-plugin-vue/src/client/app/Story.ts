import type { Story } from '@histoire/shared'
import type { PropType, VNode } from 'vue'
import { omitInheritStoryProps } from '@histoire/shared'
import { cloneVNode, computed, defineComponent, getCurrentInstance, h, isReadonly, isRef, provide, reactive, renderSlot, useAttrs } from 'vue'
import { useRenderContext } from './render-context.js'
import Variant from './Variant'

/** Vue sets this flag on component instances and values explicitly kept raw. */
function isLocalBinding(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { __v_skip?: boolean }).__v_skip === true
}

export default defineComponent({

  name: 'Story',
  __histoireType: 'story',

  inheritAttrs: false,

  props: {
    initState: {
      type: Function as PropType<() => any | Promise<any>>,
      default: undefined,
    },

    meta: {
      type: Object as PropType<Story['meta']>,
      default: undefined,
    },

    /**
     * Story-level default for its variants. Declared as a prop (not left in
     * `$attrs`) so Vue normalizes `auto-props-disabled` casing and boolean
     * casting; `undefined` when not set. Variants read it through injection in
     * both mount and render passes.
     */
    autoPropsDisabled: {
      type: Boolean,
      default: undefined,
    },
  },

  setup(props) {
    const vm = getCurrentInstance()

    const attrs = useAttrs() as {
      story: Story
    }

    const renderContext = useRenderContext()
    const story = computed(() => attrs.story)
    provide('story', story)
    provide('storyAutoPropsDisabled', () => props.autoPropsDisabled)

    const storyComponent: any = vm.parent
    const implicitState = reactive<Record<string, any>>({})

    Object.defineProperty(implicitState, '$data', {
      enumerable: true,
      configurable: true,
      get: () => storyComponent.data,
      set: (value) => {
        Object.assign(storyComponent.data, value)
      },
    })

    /** Expose a story binding without giving the state bridge ownership of local values. */
    function addImplicitState(source: Record<string, any>, key: string) {
      const value = source[key]

      if (typeof value === 'function' || (value?.__file) || typeof value?.render === 'function' || typeof value?.setup === 'function') {
        return
      }

      Object.defineProperty(implicitState, key, {
        enumerable: true,
        configurable: true,
        get: () => {
          const currentValue = source[key]
          const value = isRef(currentValue) ? currentValue.value : currentValue
          return isLocalBinding(value) ? undefined : value
        },
        set: (newValue) => {
          const currentValue = source[key]
          const value = isRef(currentValue) ? currentValue.value : currentValue
          if (isLocalBinding(value) || isReadonly(currentValue)) return

          if (isRef(currentValue)) {
            currentValue.value = newValue
          }
          else if (currentValue && typeof currentValue === 'object' && newValue && typeof newValue === 'object') {
            Object.assign(currentValue, newValue)
          }
          else {
            source[key] = newValue
          }
        },
      })
    }

    // From `<script setup>`'s `defineExpose`
    for (const key in storyComponent.exposed) {
      addImplicitState(storyComponent.exposed, key)
    }
    // We needs __VUE_PROD_DEVTOOLS__ flag set to `true` to enable `devtoolsRawSetupState`
    for (const key in storyComponent.devtoolsRawSetupState) {
      addImplicitState(storyComponent.devtoolsRawSetupState, key)
    }
    for (const key in storyComponent.data) {
      addImplicitState(storyComponent.data, key)
    }
    provide('implicitState', () => implicitState)

    function updateStory() {
      if (props.meta) {
        if (!attrs.story.meta) {
          attrs.story.meta = {}
        }

        Object.assign(attrs.story.meta, props.meta)
      }

      Object.assign(attrs.story, {
        slots: () => vm.proxy.$slots,
      })
    }

    return {
      renderContext,
      story,
      renderMountStory,
      renderPreviewStory,
      updateStory,
    }

    function renderMountStory() {
      let index = 0

      const applyAttrs = (vnodes: VNode[]) => {
        const result: VNode[] = []

        for (const vnode of vnodes) {
          // @ts-expect-error custom option
          if (vnode.type?.__histoireType === 'variant') {
            const variant = attrs.story.variants[index]
            index++

            if (!variant) {
              continue
            }

            const nextProps: any = {
              variant,
            }

            if (!vnode.props?.initState && !vnode.props?.['init-state']) {
              nextProps.initState = props.initState
            }

            for (const attr in vm.proxy.$attrs) {
              if (typeof vnode.props?.[attr] === 'undefined') {
                nextProps[attr] = vm.proxy.$attrs[attr]
              }
            }

            for (const attr in attrs.story) {
              if (!omitInheritStoryProps.includes(attr) && typeof vnode.props?.[attr] === 'undefined') {
                nextProps[attr] = attrs.story[attr]
              }
            }

            result.push(cloneVNode(vnode, nextProps))
            continue
          }

          if (Array.isArray(vnode.children)) {
            vnode.children = applyAttrs(vnode.children as VNode[])
          }

          result.push(vnode)
        }

        return result
      }

      return applyAttrs(vm.proxy.$slots.default?.() ?? [])
    }

    function renderPreviewStory() {
      renderContext.nextVariantIndex.value = 0

      const slotProps = {
        state: renderContext.externalState,
      }

      const children = []

      if (renderContext.slotName === 'controls') {
        children.push(renderSlot(vm.proxy.$slots, 'controls', slotProps))
      }

      if (renderContext.slotName === 'default' || attrs.story.meta?.hasVariantChildComponents) {
        children.push(renderSlot(vm.proxy.$slots, 'default', slotProps))
      }

      return children
    }
  },

  render() {
    this.updateStory()

    const [firstVariant] = this.story.variants

    if (firstVariant?.id === '_default') {
      return h(Variant, {
        variant: firstVariant,
        initState: this.initState,
        implicit: true,
        ...this.$attrs,
      }, this.$slots)
    }

    if (this.renderContext?.mode === 'render') {
      return this.renderPreviewStory()
    }

    return this.renderMountStory()
  },
})
