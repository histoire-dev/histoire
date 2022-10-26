<script lang="ts">
import { Story } from '@histoire/shared'
import { getContext, setContext } from 'svelte'

const story: Story = getContext('__hstStory')
const slotName: string = getContext('__hstSlot')

let index = { value: 0 }
setContext('__hstIndex', index)
</script>

{#if slotName === 'controls'}
  <slot name="controls" />
{/if}
{#if slotName === 'default' || story.meta?.hasVariantChildComponents}
  <slot />
{/if}
