<script lang="ts">
import { ServerStory, ServerVariant } from '@histoire/shared'
import { getContext } from 'svelte'

export let title: string = 'untitled'
export let id: string = null
export let icon: string = null
export let iconColor: string = null

const story: ServerStory = getContext('__hstStory')
const addVariant: (variant: ServerVariant) => void = getContext('__hstAddVariant')

function generateId () {
  return `${story.id}-${story.variants.length}`
}

const variant: ServerVariant = {
  id: id ?? generateId(),
  title,
  icon,
  iconColor,
}

addVariant(variant)
</script>
