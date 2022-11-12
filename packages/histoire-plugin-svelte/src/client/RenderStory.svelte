<script lang="ts">
import type { Story, Variant } from '@histoire/shared'
import { getContext, setContext } from 'svelte'

const story: Story = getContext('__hstStory')
const currentVariant: Variant = getContext('__hstVariant')
const slotName: string = getContext('__hstSlot')

let index = { value: 0 }
setContext('__hstIndex', index)

export let source: string = null

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
