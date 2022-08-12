<script lang="ts">
import { getContext, setContext } from 'svelte'

const slotName: string = getContext('__hstSlot')

let index = { value: 0 }
setContext('__hstIndex', index)
</script>

{#if slotName === 'controls'}
  <slot name="controls" />
{/if}
{#if slotName === 'default'}
  <slot />
{/if}
