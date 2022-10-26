<script>
  import BaseButton from './BaseButton.svelte'

  export let Hst

  let disabled = false
  let content = 'Hello world'
</script>

<Hst.Story>
  <Hst.Variant title="Variant 1">
    <BaseButton {disabled}>
      {content} 1
    </BaseButton>

    <svelte:fragment slot="controls">
      <Hst.Text bind:value={content} title="Content 1" />
      <Hst.Checkbox bind:value={disabled} title="Disabled 1" />
    </svelte:fragment>
  </Hst.Variant>

  <Hst.Variant title="Variant 2">
    <BaseButton {disabled}>
      {content} 2
    </BaseButton>

    <svelte:fragment slot="controls">
      <Hst.Text bind:value={content} title="Content 2" />
      <Hst.Checkbox bind:value={disabled} title="Disabled 2" />
    </svelte:fragment>
  </Hst.Variant>
</Hst.Story>