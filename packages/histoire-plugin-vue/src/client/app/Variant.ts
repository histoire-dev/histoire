import type { Variant } from '@histoire/shared'
import type { ComputedRef, PropType } from 'vue'
import { applyState } from '@histoire/shared'
import { computed, defineComponent, getCurrentInstance, inject, onBeforeUnmount, useAttrs } from 'vue'
import { syncVariantAutoProps } from './auto-props.js'
import { useRenderContext } from './render-context.js'
import { syncStateBundledAndExternal, toRawDeep } from './util.js'

// const logLocation = location.href.includes('__sandbox') ? '[Sandbox]' : '[Host]'

export default defineComponent({

  name: 'Variant',
  __histoireType: 'variant',

  props: {
    initState: {
      type: Function as PropType<() => any | Promise<any>>,
      default: undefined,
    },

    source: {
      type: String,
      default: undefined,
    },

    responsiveDisabled: {
      type: Boolean,
      default: false,
    },

    autoPropsDisabled: {
      type: Boolean,
      default: false,
    },

    setupApp: {
      type: Function,
      default: undefined,
    },

    meta: {
      type: Object as PropType<Variant['meta']>,
      default: undefined,
    },

    implicit: {
      type: Boolean,
      default: false,
    },
  },

  async setup(props) {
    const attrs = useAttrs() as {
      variant?: Variant
    }
    const vm = getCurrentInstance()!
    const story = inject<ComputedRef<any>>('story')!
    const implicitState = inject<() => any>('implicitState')
    const renderContext = useRenderContext()
    let lastPropsTypesSnapshot: string
    let renderVariant: Variant | undefined
    let renderStateSync: ReturnType<typeof syncStateBundledAndExternal> | null = null

    const mountVariant = computed(() => attrs.variant)

    if (renderContext?.mode !== 'render' && typeof props.initState === 'function' && mountVariant.value) {
      const state = await props.initState()
      applyState(mountVariant.value.state, toRawDeep(state))
    }

    if (renderContext?.mode !== 'render' && mountVariant.value && implicitState) {
      syncStateBundledAndExternal(mountVariant.value.state, implicitState())
    }

    function updateVariant(variant: Variant) {
      Object.assign(variant, {
        slots: () => vm.proxy!.$slots,
        source: props.source,
        responsiveDisabled: props.responsiveDisabled,
        autoPropsDisabled: props.autoPropsDisabled,
        setupApp: props.setupApp,
        meta: props.meta,
        configReady: true,
      })

      if (!props.implicit && !story.value.meta?.hasVariantChildComponents) {
        if (!story.value.meta) {
          story.value.meta = {}
        }

        Object.assign(story.value.meta, {
          hasVariantChildComponents: true,
        })
      }
    }

    function resolveVariant() {
      if (attrs.variant) {
        return attrs.variant
      }

      if (renderContext?.mode !== 'render') {
        return null
      }

      if (!renderVariant) {
        renderVariant = story.value.variants[renderContext!.nextVariantIndex.value]
        renderContext!.nextVariantIndex.value++
      }

      return renderVariant
    }

    function renderVariantSlot(variant: Variant) {
      const context = renderContext!
      const proxy = vm.proxy!

      if (context.slotName === 'controls') {
        return proxy.$slots.controls?.({
          state: context.externalState,
        }) ?? null
      }

      if (context.slotName !== 'default') {
        return null
      }

      const vnodes = proxy.$slots.default?.({
        state: context.externalState,
      }) ?? null

      if (vnodes && !variant.autoPropsDisabled) {
        lastPropsTypesSnapshot = syncVariantAutoProps(
          variant,
          vnodes,
          context.externalState,
          lastPropsTypesSnapshot,
        )
      }

      return vnodes
    }

    function syncRenderVariantState(variant: Variant) {
      if (!implicitState) {
        return
      }

      const shouldSync = renderContext?.mode === 'render'
        && renderContext.currentVariant?.id === variant.id

      if (shouldSync && !renderStateSync) {
        renderStateSync = syncStateBundledAndExternal(variant.state, implicitState())
      }
      else if (!shouldSync && renderStateSync) {
        renderStateSync.stop()
        renderStateSync = null
      }
    }

    if (mountVariant.value) {
      updateVariant(mountVariant.value)
    }

    onBeforeUnmount(() => {
      renderStateSync?.stop()
    })

    return {
      renderContext,
      renderVariantSlot,
      resolveVariant,
      syncRenderVariantState,
      updateVariant,
    }
  },

  render() {
    const variant = this.resolveVariant()

    if (!variant) {
      return null
    }

    this.updateVariant(variant)
    this.syncRenderVariantState(variant)

    if (this.renderContext?.mode !== 'render') {
      return null
    }

    if (this.renderContext.currentVariant?.id !== variant.id) {
      return null
    }

    return this.renderVariantSlot(variant)
  },
})
