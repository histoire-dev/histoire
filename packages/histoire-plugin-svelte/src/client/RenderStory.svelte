<script lang="ts">
import { Story } from '@histoire/shared'
import { getContext, setContext } from 'svelte';

const story: Story = getContext('__hstStory')
const slotName: string = getContext('__hstSlot')

let index = { value: 0 }
setContext('__hstIndex', index)

$: isImplicitVariant = story.variants.length === 1 && story.variants[0].id === '_default'
</script>

{#if isImplicitVariant}
  {#if slotName === 'default'}
    <slot />
  {/if}
  {#if slotName === 'controls'}
    <slot name="controls" />
  {/if}
{:else}
  <slot />
{/if}
