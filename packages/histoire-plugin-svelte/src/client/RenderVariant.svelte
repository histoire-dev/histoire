<script lang="ts">
import type { Story, Variant } from '@histoire/shared'
import { getContext } from 'svelte'

const story: Story = getContext('__hstStory')
const currentVariant: Variant = getContext('__hstVariant')
const slotName: string = getContext('__hstSlot')
const index: { value: number } = getContext('__hstIndex')

const variant = story.variants[index.value]
index.value++

const shouldRender = $derived(currentVariant.id === variant.id)

const {source = null, children, controls = null} = $props<{source: string}>()

$effect(() => {
  if (source != null) {
    Object.assign(currentVariant, {
      source,
    })
  }
})
</script>

{#if shouldRender}
  {#if slotName === 'default'}
    {@render children?.()}
  {/if}
  {#if slotName === 'controls'}
    {@render controls?.()}
  {/if}
{/if}
