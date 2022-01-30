<script lang="ts">
import { defineComponent, inject, onBeforeMount, onBeforeUnmount, PropType, reactive, Ref, ref } from 'vue'
import { Story, Variant } from '../../types'

export default defineComponent({
  props: {
    title: {
      type: String,
      required: true,
    },

    initState: {
      type: Function as PropType<() => any | Promise<any>>,
      default: null,
    },
  },

  setup (props) {
    const story = inject<Ref<Story>>('story')

    function generateId () {
      let index = 0
      const idMap = story.value.variants.reduce((acc, variant) => {
        acc[variant.id] = true
        return acc
      }, {} as Record<string, boolean>)
      while (idMap[`${story.value.id}-${index}`]) {
        index++
      }
      return `${story.value.id}-${index}`
    }

    function getVariantData () {
      return {
        title: props.title,
        initState: async () => {
          if (typeof props.initState === 'function') {
            variant.value.state = await props.initState()
          }
        },
        slots: () => null,
      }
    }

    const variant = ref<Variant>(null)

    const addVariant = inject('addVariant') as (variant: Variant) => void
    onBeforeMount(() => {
      variant.value = {
        id: generateId(),
        state: reactive<any>({}),
        ...getVariantData(),
      }
      addVariant(variant.value)
    })

    const removeVariant = inject('removeVariant') as (variant: Variant) => void
    onBeforeUnmount(() => {
      removeVariant(variant.value)
    })

    return {
      variant,
      getVariantData,
    }
  },

  render () {
    Object.assign(this.variant, this.getVariantData(), {
      slots: () => this.$slots,
    })
    return null
  },
})
</script>
