<script>
import { getContext } from 'svelte'

export let title = 'untitled'
export let id = null
export let icon = null
export let iconColor = null

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
}

addVariant(variant)
</script>
