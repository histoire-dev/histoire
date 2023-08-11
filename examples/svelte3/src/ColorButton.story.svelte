<script lang="ts">
  import { logEvent } from 'histoire/client'
  import type { Hst } from '@histoire/plugin-svelte'
  import ColorButton from './ColorButton.svelte'

  export let Hst: Hst

  let disabled = false
  let size = 'medium'
  let colorselect = "#000000"

  let source;

  $: {
    source = `<ColorButton`;
    if (disabled) {
      source += ` disabled`;
    }
    source += `>Click me !</ColorButton>`;
  }
</script>
  
<Hst.Story title="ColorButton" {source}>
  <ColorButton {disabled} {colorselect} on:click={event => logEvent('click', event)}>
    Click me!
  </ColorButton>
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
    <Hst.ColorSelect
      bind:value={colorselect}
      title="Background Color"
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
