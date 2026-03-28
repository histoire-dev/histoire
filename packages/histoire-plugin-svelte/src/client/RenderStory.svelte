<script>
import { getContext, setContext } from 'svelte'

const story = getContext('__hstStory')
const currentVariant = getContext('__hstVariant')
const slotName = getContext('__hstSlot')

let index = { value: 0 }
setContext('__hstIndex', index)

export let source = null

$: {
  if (source != null) {
    Object.assign(currentVariant, {
      source,
    })
  }
}
</script>

{#if slotName === 'controls'}
  <slot name="controls" />
{/if}
{#if slotName === 'default' || story.meta?.hasVariantChildComponents}
  <slot />
{/if}
