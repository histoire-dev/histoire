<script>
import { getContext } from 'svelte'

export let title = 'untitled'
export let id = null
export let icon = null
export let iconColor = null
/** JSON metadata published in the catalog for plugins. */
export let meta = undefined

const story = getContext('__hstStory')
const addVariant = getContext('__hstAddVariant')

function generateId () {
  return `${story.id}-${story.variants.length}`
}

const variant = {
  id: id ?? generateId(),
  title,
  icon,
  iconColor,
  meta,
}

addVariant(variant)
</script>
