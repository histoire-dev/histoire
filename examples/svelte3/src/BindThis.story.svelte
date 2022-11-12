<script>
  export let Hst

  let disabled = false;
  let button = undefined;
  let checkbox = undefined;
</script>
  
<Hst.Story title="BindThisVsControls">
  <button bind:this={button} {disabled}>
    Hello Histoire
  </button>

  <section>
    button={button}
    checkbox={checkbox}
  </section>

  <label>
    <input
      type="checkbox"
      bind:checked={disabled}
    />
    Disabled
  </label>

  <Hst.Checkbox
    bind:this={checkbox}
    title="Checkbox"
  />

  <svelte:fragment slot="controls">
    <Hst.Checkbox
      bind:value={disabled}
      title="Disabled"
    />
  </svelte:fragment>
</Hst.Story>
