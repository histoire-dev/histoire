<script lang="ts">
import { ServerStory, ServerStoryFile, ServerVariant } from '@histoire/shared'
import { getContext, setContext } from 'svelte'

export let title: string = null
export let id: string = null
export let group: string = null
export let layout: ServerStory['layout'] = null
export let icon: string = null
export let iconColor: string = null
export let docsOnly: boolean = false

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

<slot />
