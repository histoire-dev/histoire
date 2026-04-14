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
    const vm = getCurrentInstance()
    const story = inject<ComputedRef<any>>('story')
    const implicitState = inject<() => any>('implicitState')
    const renderContext = useRenderContext()
    let lastPropsTypesSnapshot: string
    let renderVariant: Variant
    let renderStateSync: ReturnType<typeof syncStateBundledAndExternal>

    const mountVariant = computed(() => attrs.variant)

    if (renderContext?.mode !== 'render' && typeof props.initState === 'function' && mountVariant.value) {
      const state = await props.initState()
      applyState(mountVariant.value.state, toRawDeep(state))
    }

    if (renderContext?.mode !== 'render' && mountVariant.value && implicitState) {
      // Hidden mount pass still needs each variant to start with its own
      // snapshot of story-level exposed/setup/data state so detected controls
      // and props are collected deterministically for every grid cell.
      applyState(mountVariant.value.state, toRawDeep(implicitState()))
    }

    function updateVariant(variant: Variant) {
      Object.assign(variant, {
        slots: () => vm.proxy.$slots,
        source: props.source,
        responsiveDisabled: props.responsiveDisabled,
        autoPropsDisabled: props.autoPropsDisabled,
        setupApp: props.setupApp,
        meta: props.meta,
        configReady: true,
      })

      if (!props.implicit && !story.value?.meta?.hasVariantChildComponents) {
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
        renderVariant = story.value?.variants[renderContext.nextVariantIndex.value]
        renderContext.nextVariantIndex.value++
      }

      return renderVariant
    }

    function renderVariantSlot(variant: Variant) {
      if (renderContext.slotName === 'controls') {
        return vm.proxy.$slots.controls?.({
          state: renderContext.externalState,
        }) ?? null
      }

      if (renderContext.slotName !== 'default') {
        return null
      }

      const vnodes = vm.proxy.$slots.default?.({
        state: renderContext.externalState,
      }) ?? null

      if (vnodes && !variant.autoPropsDisabled) {
        lastPropsTypesSnapshot = syncVariantAutoProps(
          variant,
          vnodes,
          renderContext.externalState,
          lastPropsTypesSnapshot,
        )
      }

      return vnodes
    }

    function syncMountVariantAutoProps(variant: Variant) {
      if (props.implicit || variant.autoPropsDisabled) {
        return
      }

      const vnodes = vm.proxy.$slots.default?.({
        state: variant.state,
      }) ?? null

      if (vnodes) {
        lastPropsTypesSnapshot = syncVariantAutoProps(
          variant,
          vnodes,
          variant.state,
          lastPropsTypesSnapshot,
        )
      }
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
      syncMountVariantAutoProps,
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
      this.syncMountVariantAutoProps(variant)
      return null
    }

    if (this.renderContext.currentVariant?.id !== variant.id) {
      return null
    }

    return this.renderVariantSlot(variant)
  },
})
