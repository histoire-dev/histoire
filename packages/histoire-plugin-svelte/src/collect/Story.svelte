<script>
import { getContext, setContext } from 'svelte'

export let title = null
export let id = null
export let group = null
export let layout = null
export let icon = null
export let iconColor = null
export let docsOnly = false

const addStory = getContext('__hstAddStory')
const file = getContext('__hstStoryFile')

const story = {
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
setContext('__hstAddVariant', (variant) => {
  story.variants.push(variant)
})
</script>

<slot />
