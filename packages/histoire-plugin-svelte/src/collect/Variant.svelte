<script lang="ts">
import { ServerStory, ServerVariant } from '@histoire/shared'
import { getContext } from 'svelte'

let {title="untitled", id=null, icon=null, iconColor=null} = $props();

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
