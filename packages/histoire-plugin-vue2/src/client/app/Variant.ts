import { defineComponent, getCurrentInstance, inject, PropType, useAttrs } from 'vue'
import type { Variant } from '@histoire/shared'
import { applyState } from '@histoire/shared'
import { syncStateBundledAndExternal, toRawDeep } from './util.js'

// const logLocation = location.href.includes('__sandbox') ? '[Sandbox]' : '[Host]'

export default Object.assign(defineComponent({
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Variant',

  props: {
    initState: {
      type: Function as PropType<() => any | Promise<any>>,
      default: null,
    },

    source: {
      type: String,
      default: null,
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
      default: null,
    },
  },

  setup (props) {
    const attrs = useAttrs() as {
      variant: Variant
    }

    const vm = getCurrentInstance()

    const implicitState = inject<() => any>('implicitState')

    if (typeof props.initState === 'function') {
      const state = props.initState()
      applyState(attrs.variant.state, toRawDeep(state))
    }

    syncStateBundledAndExternal(attrs.variant.state, implicitState())

    function updateVariant () {
      Object.assign(attrs.variant, {
        slots: () => vm.proxy.$scopedSlots,
        source: props.source,
        responsiveDisabled: props.responsiveDisabled,
        autoPropsDisabled: props.autoPropsDisabled,
        setupApp: props.setupApp,
        configReady: true,
      })
    }
    updateVariant()

    return {
      updateVariant,
    }
  },

  render () {
    // Trigger variant updates to (re-)render slots
    // @ts-ignore
    this.updateVariant()
    return null
  },
}), {
  __histoireType: 'variant',
})
