<script>
import BaseButton from './BaseButton.svelte'

export let Hst

let disabled = false
</script>
  
<Hst.Story title="BaseButton">
  <BaseButton {disabled}>
    Click me!
  </BaseButton>
  <div>
    <label>
      <input type="checkbox" bind:checked={disabled} >
      Disabled
    </label>
  </div>

  <div slot="controls" style="padding: 8px;">
    <label>
      <input type="checkbox" bind:checked={disabled} >
      Disabled
    </label>
  </div>
</Hst.Story>
