<script lang="ts" setup>
import { App, createApp, onMounted, onUnmounted, PropType, ref } from 'vue'
import { Story, Variant } from '../../types'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },

  story: {
    type: Object as PropType<Story>,
    required: true,
  },

  slotName: {
    type: String,
    default: 'default',
  },
})

const sandbox = ref<HTMLDivElement>()
let app: App

onMounted(async () => {
  await props.variant.initState()

  app = createApp({
    render: () => {
      return props.variant.slots()?.[props.slotName]?.({
        state: props.variant.state,
      })
    },
  })
  const target = document.createElement('div')
  sandbox.value.appendChild(target)
  app.mount(target)
})

onUnmounted(() => {
  app.unmount()
})
</script>

<template>
  <div
    ref="sandbox"
    class="__histoire-sandbox htw-overflow-auto"
  />
</template>
