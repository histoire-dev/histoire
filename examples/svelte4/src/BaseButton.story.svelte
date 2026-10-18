<script lang="ts">
  import { logEvent } from 'histoire/client'
  import type { Hst } from '@histoire/plugin-svelte'
  import BaseButton from './BaseButton.svelte'

  export let Hst: Hst

  let disabled = false
  let size = 'medium'

  let source;

  $: {
    source = `<BaseButton`;
    if (disabled) {
      source += ` disabled`;
    }
    source += `>Click me !</BaseButton>`;
  }
</script>
  
<Hst.Story title="BaseButton" {source}>
  <div class="example-stage example-stack">
    <BaseButton {disabled} {size} on:click={event => logEvent('click', event)}>
      Click me!
    </BaseButton>
    <div>
      <label class="example-row">
        <input class="example-checkbox" type="checkbox" bind:checked={disabled} >
        Disabled
      </label>
    </div>
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
