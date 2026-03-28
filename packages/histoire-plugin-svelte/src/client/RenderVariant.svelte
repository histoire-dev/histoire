<script>
import { getContext } from 'svelte'

const story = getContext('__hstStory')
const currentVariant = getContext('__hstVariant')
const slotName = getContext('__hstSlot')
const index = getContext('__hstIndex')

const variant = story.variants[index.value]
index.value++

$: shouldRender = currentVariant.id === variant.id

export let source = null

$: {
  if (source != null) {
    Object.assign(currentVariant, {
      source,
    })
  }
}
</script>

{#if shouldRender}
  {#if slotName === 'default'}
    <slot />
  {/if}
  {#if slotName === 'controls'}
    <slot name="controls" />
  {/if}
{/if}
