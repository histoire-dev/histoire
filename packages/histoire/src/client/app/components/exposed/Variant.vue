<script lang="ts">
import { defineComponent, getCurrentInstance, inject, PropType, useAttrs, watch } from 'vue'
import { Variant } from '../../types'

// const logLocation = location.href.includes('__sandbox') ? '[Sandbox]' : '[Host]'

export default defineComponent({
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Variant',
  __histoireType: 'variant',

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
  },

  setup (props) {
    const attrs = useAttrs() as {
      variant: Variant
    }

    const vm = getCurrentInstance()

    const implicitState = inject<() => any>('implicitState')

    watch(() => implicitState, value => {
      if (typeof props.initState !== 'function') {
        attrs.variant.state = value()
      }
    }, {
      immediate: true,
    })

    function updateVariant () {
      Object.assign(attrs.variant, {
        initState: async () => {
          if (typeof props.initState === 'function') {
            attrs.variant.state = await props.initState()
          }
        },
        slots: () => vm.proxy.$slots,
        source: props.source,
        responsiveDisabled: props.responsiveDisabled,
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
    this.updateVariant()
    return null
  },
})
</script>
