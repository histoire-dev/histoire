<script lang="ts" setup>
import { App, createApp, onMounted, onUnmounted, PropType, ref, watch } from 'vue'
import { Story, Variant } from '../../types'
// @ts-expect-error virtual module id
import * as setup from '$histoire-setup'

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

const emit = defineEmits({
  ready: () => true,
})

const sandbox = ref<HTMLDivElement>()
let app: App
let mounting = false

async function mountVariant () {
  mounting = true

  await props.variant.initState()

  app = createApp({
    name: 'SandboxVue3',

    render: () => {
      return props.variant.slots()?.[props.slotName]?.({
        state: props.variant.state ?? {},
      })
    },
  })

  if (typeof setup?.setupVue3 === 'function') {
    await setup.setupVue3({
      app,
      story: props.story,
      variant: props.variant,
    })
  }

  const target = document.createElement('div')
  sandbox.value.appendChild(target)
  app.mount(target)

  emit('ready')
}

onMounted(async () => {
  if (props.variant.initState) {
    await mountVariant()
  }
})

watch(() => props.variant.initState, value => {
  if (value && !mounting) {
    mountVariant()
  }
})

onUnmounted(() => {
  app?.unmount()
})
</script>

<template>
  <div
    ref="sandbox"
    class="__histoire-sandbox htw-overflow-auto"
  />
</template>
