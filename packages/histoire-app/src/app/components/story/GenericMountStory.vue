<script lang="ts">
export default {
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import type { Story } from '../../types'
import { clientSupportPlugins } from 'virtual:$histoire-support-plugins-client'
import { markRaw, ref, watchEffect } from 'vue'
import { resolveStoryFileComponent } from '../../util/story-component'

const props = defineProps<{
  story: Story
}>()

const mountComponent = ref(null)

watchEffect(async () => {
  const clientPlugin = clientSupportPlugins[props.story.file?.supportPluginId]
  if (!clientPlugin) {
    return
  }

  // The story component is exposed as a loader: resolve it before mounting, or
  // the support plugin renders the loader itself.
  await resolveStoryFileComponent(props.story.file)
  const pluginModule = await clientPlugin()
  mountComponent.value = markRaw(pluginModule.MountStory)
})
</script>

<template>
  <component
    :is="mountComponent"
    v-if="mountComponent"
    class="histoire-generic-mount-story"
    :story="story"
    v-bind="$attrs"
  />
</template>
