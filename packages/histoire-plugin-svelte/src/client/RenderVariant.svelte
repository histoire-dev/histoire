<script lang="ts">
import { Story } from '@histoire/shared'
import { getContext } from 'svelte'
import Variant from '../collect/Variant.svelte';

const story: Story = getContext('__hstStory')
const currentVariant: Variant = getContext('__hstVariant')
const slotName: string = getContext('__hstSlot')
const index: { value: number } = getContext('__hstIndex')

const variant = story.variants[index.value]
index.value++

$: shouldRender = currentVariant.id === variant.id
</script>

{#if shouldRender}
  {#if slotName === 'default'}
    <slot />
  {/if}
  {#if slotName === 'controls'}
    <slot name="controls" />
  {/if}
{/if}
