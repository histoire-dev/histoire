<script>
import { getContext, setContext } from 'svelte'

export let title = null
export let id = null
export let group = null
export let layout = null
/** Explicit finite prop values for matrix axes. */
export let matrix = null
export let icon = null
export let iconColor = null
export let docsOnly = false
/** JSON metadata published in the catalog for plugins. */
export let meta = undefined

const addStory = getContext('__hstAddStory')
const file = getContext('__hstStoryFile')

const story = {
  id: id ?? file.id,
  title: title ?? file.fileName,
  group,
  layout,
  matrix,
  icon,
  iconColor,
  docsOnly,
  meta,
  variants: [],
}

addStory(story)

setContext('__hstStory', story)
setContext('__hstAddVariant', (variant) => {
  story.variants.push(variant)
})
</script>

<slot />
