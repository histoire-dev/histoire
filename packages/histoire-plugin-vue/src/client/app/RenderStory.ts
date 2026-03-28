import type { Story, Variant } from '@histoire/shared'
import type {
  PropType as _PropType,
} from '@histoire/vendors/vue'
import {
  defineComponent as _defineComponent,
  h as _h,
  onBeforeUnmount as _onBeforeUnmount,
  onMounted as _onMounted,
  ref as _ref,
  watch as _watch,
} from '@histoire/vendors/vue'
import { reactive } from 'vue'
import { createPreviewHost } from './host.js'
import { syncStateBundledAndExternal } from './util.js'

export default _defineComponent({
  name: 'RenderStory',

  props: {
    variant: {
      type: Object as _PropType<Variant>,
      required: true,
    },

    story: {
      type: Object as _PropType<Story>,
      required: true,
    },

    slotName: {
      type: String,
      default: 'default',
    },
  },

  emits: {
    ready: () => true,
  },

  setup(props, { emit }) {
    const sandbox = _ref<HTMLDivElement>()
    let host: ReturnType<typeof createPreviewHost>
    let mounting = false

    const externalState = reactive<Variant['state']>({})
    let stateSync = syncStateBundledAndExternal(props.variant.state, externalState)
    const renderContext = reactive({
      mode: 'render' as const,
      slotName: props.slotName,
      currentVariant: props.variant,
      externalState,
      nextVariantIndex: {
        value: 0,
      },
    })

    function unmountVariant() {
      host?.unmount()
      host = null
    }

    function syncExternalState() {
      stateSync?.stop()
      stateSync = syncStateBundledAndExternal(props.variant.state, externalState)
    }

    async function mountVariant() {
      if (mounting) return
      mounting = true

      unmountVariant()
      renderContext.currentVariant = props.variant
      renderContext.slotName = props.slotName

      host = createPreviewHost({
        name: 'RenderStorySubApp',
        el: sandbox.value,
        getStory: () => props.story,
        getVariant: () => props.variant,
        renderContext,
        wrapInDiv: true,
      })

      await host.mount()
      mounting = false

      emit('ready')
    }

    _onMounted(async () => {
      if (props.variant.configReady) {
        await mountVariant()
      }
    })

    _watch(() => props.variant, () => {
      renderContext.currentVariant = props.variant
      syncExternalState()
    })

    _watch(() => [props.story.id, props.slotName, props.variant.id, props.variant.configReady] as const, async ([, slotName]) => {
      renderContext.currentVariant = props.variant
      renderContext.slotName = slotName

      if (props.variant.configReady && !mounting) {
        if (!host) {
          await mountVariant()
        }
        else {
          host.forceUpdate()
        }
      }
    })

    _onBeforeUnmount(() => {
      stateSync?.stop()
      unmountVariant()
    })

    return {
      sandbox,
    }
  },

  render() {
    return _h('div', {
      ref: 'sandbox',
    })
  },
})
