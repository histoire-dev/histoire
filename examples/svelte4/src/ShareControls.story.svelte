<script>
  import BaseButton from './BaseButton.svelte'

  export let Hst

  let disabled = false
  let content = 'Hello world'
</script>

<Hst.Story>
  <svelte:fragment slot="controls">
    <Hst.Text bind:value={content} title="Content" />
    <Hst.Checkbox bind:value={disabled} title="Disabled" />
  </svelte:fragment>

  <Hst.Variant title="Variant 1">
    <BaseButton {disabled}>
      {content}
    </BaseButton>
  </Hst.Variant>

  <Hst.Variant title="Variant 2">
    <BaseButton {disabled}>
      {content}
    </BaseButton>
  </Hst.Variant>
</Hst.Story>