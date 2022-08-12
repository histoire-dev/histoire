<script>
import BaseButton from './BaseButton.svelte'

export let Hst

let disabled = false
let size = 'medium'
</script>
  
<Hst.Story title="BaseButton">
  <BaseButton {disabled} {size}>
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
  </svelte:fragment>
</Hst.Story>
