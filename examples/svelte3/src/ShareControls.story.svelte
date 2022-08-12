<script>
  export let Hst

  let disabled = false
  let content = 'Hello world'
</script>

<Hst.Story>
  <svelte:fragment slot="controls">
    Content: <input type="text" bind:value={content} />
    Disabled: <input type="checkbox" bind:checked={disabled} />
  </svelte:fragment>

  <Hst.Variant title="Variant 1">
    <button {disabled}>
      {content}
    </button>
  </Hst.Variant>

  <Hst.Variant title="Variant 2">
    <button {disabled}>
      {content}
    </button>
  </Hst.Variant>
</Hst.Story>