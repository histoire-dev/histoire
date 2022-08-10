<script lang="ts">
export default {
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
// @ts-expect-error virtual module
import { clientSupportPlugins } from 'virtual:$histoire-support-plugins-client'
import { ref, watchEffect, markRaw } from 'vue'
import type { Story } from '../../types'

const props = defineProps<{
  story: Story
}>()

const mountComponent = ref(null)

watchEffect(async () => {
  const clientPlugin = clientSupportPlugins[props.story.file?.supportPluginId]
  if (clientPlugin) {
    const pluginModule = await clientPlugin()
    mountComponent.value = markRaw(pluginModule.RenderStory)
  }
})
</script>

<template>
  <component
    :is="mountComponent"
    v-if="mountComponent"
    :story="story"
    v-bind="$attrs"
  />
</template>
