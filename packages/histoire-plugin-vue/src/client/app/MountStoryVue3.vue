<script lang="ts" setup>
import { App, createApp, h, onMounted, onUnmounted, ref } from 'vue'
import type { Story } from '@histoire/shared'
import { registerGlobalComponents } from './global-components.js'
import { RouterLinkStub } from './RouterLinkStub'

const props = defineProps<{
  story: Story
}>()

const el = ref<HTMLDivElement>()
let app: App

async function mountStory () {
  app = createApp({
    name: 'MountStoryVue3',

    render: () => {
      return h(props.story.file.component, {
        story: props.story,
      })
    },
  })

  registerGlobalComponents(app)

  // Stubs
  app.component('RouterLink', RouterLinkStub)

  const target = document.createElement('div')
  el.value.appendChild(target)
  app.mount(target)
}

onMounted(async () => {
  await mountStory()
})

onUnmounted(() => {
  app?.unmount()
})
</script>

<template>
  <div ref="el" />
</template>
