<script lang="ts">
import { ServerStory, ServerStoryFile, ServerVariant } from '@histoire/shared'
import { getContext, setContext } from 'svelte'

let { title = null, id = null, group = null, layout = null, icon = null, iconColor = null, docsOnly = false, children } = $props()

const addStory: (story: ServerStory) => void = getContext('__hstAddStory')
const file: ServerStoryFile = getContext('__hstStoryFile')

const story: ServerStory = {
  id: id ?? file.id,
  title: title ?? file.fileName,
  group,
  layout,
  icon,
  iconColor,
  docsOnly,
  variants: [],
}

addStory(story)

setContext('__hstStory', story)
setContext('__hstAddVariant', (variant: ServerVariant) => {
  story.variants.push(variant)
})
</script>

{@render children?.()}
