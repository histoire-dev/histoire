<script lang="ts">
  import { logEvent } from 'histoire/client'
  import type { Hst } from '@histoire/plugin-svelte'
  import BaseButton from './BaseButton.svelte'

  export let Hst: Hst

  let disabled = false
  let size = 'medium'
</script>
  
<Hst.Story title="BaseButton">
  <BaseButton {disabled} {size} on:click={event => logEvent('click', event)}>
    Click me!
  </BaseButton>
  <div style="margin-top: 6px;">
    <label>
      <input type="checkbox" bind:checked={disabled} >
      Disabled
    </label>
  </div>

  <svelte:fragment slot="controls">
    <Hst.Checkbox
      bind:value={disabled}
      title="Disabled"
    />
    <Hst.Select
      bind:value={size}
      options={['small', 'medium', 'large']}
      title="Size"
    />
    <pre>{JSON.stringify({ disabled, size }, null, 2)}</pre>
  </svelte:fragment>
</Hst.Story>

<style>
  pre {
    padding: 8px;
    background: rgba(0, 0, 0, .1);
    border-radius: 4px;
    margin: 8px;
    font-size: 0.8rem;
  }
</style>
