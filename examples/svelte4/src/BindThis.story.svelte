<script>
  export let Hst

  let disabled = false;
  let button = undefined;
</script>
  
<Hst.Story title="BindThisVsControls">
  <div class="example-stage example-stack">
    <button type="button" class="example-button" bind:this={button} {disabled}>
      Hello Histoire
    </button>

    <section class="example-output">
      button={button}
    </section>

    <label class="example-row">
      <input
        class="example-checkbox"
        type="checkbox"
        bind:checked={disabled}
      />
      Disabled
    </label>
  </div>

  <svelte:fragment slot="controls">
    <Hst.Checkbox
      bind:value={disabled}
      title="Disabled"
    />
  </svelte:fragment>
</Hst.Story>
