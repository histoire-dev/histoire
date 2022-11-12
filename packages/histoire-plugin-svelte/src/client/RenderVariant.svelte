<script lang="ts">
import type { Story, Variant } from '@histoire/shared'
import { getContext } from 'svelte'

const story: Story = getContext('__hstStory')
const currentVariant: Variant = getContext('__hstVariant')
const slotName: string = getContext('__hstSlot')
const index: { value: number } = getContext('__hstIndex')

const variant = story.variants[index.value]
index.value++

$: shouldRender = currentVariant.id === variant.id

export let source: string = null

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
