<script lang="ts">
import { Story } from '@histoire/shared'
import { getContext, setContext } from 'svelte'
import MountVariant from './MountVariant.svelte'

const story: Story = getContext('__hstStory')
let index = { value: 0 }
setContext('__hstIndex', index)
setContext('__hstSlots', $$slots)
</script>

<slot />

{#if story.variants.length === 1 && story.variants[0].id === '_default'}
  <MountVariant {...$$restProps}>
    <slot />
    <slot name="controls" slot="controls" />
  </MountVariant>
{/if}
