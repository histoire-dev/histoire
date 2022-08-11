<script>
import BaseButton from './BaseButton.svelte'

export let Hst
</script>
  
<Hst.Story title="BaseButton">
  <BaseButton>
    Click me!
  </BaseButton>

  <svelte:fragment slot="controls">
    Controls here
  </svelte:fragment>
</Hst.Story>
