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
  <div class="example-stage example-stack">
    <ColorButton {disabled} {colorselect} on:click={event => logEvent('click', event)}>
      Click me!
    </ColorButton>
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
    <Hst.ColorSelect
      bind:value={colorselect}
      title="Background Color"
    />
    <pre>{JSON.stringify({ disabled, size }, null, 2)}</pre>
  </svelte:fragment>
</Hst.Story>
