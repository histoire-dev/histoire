# State & Controls

Use controls to change a variant’s state while it runs on the canvas.

## Defining state

Define the state your story and controls share. Histoire synchronizes reactive variables declared with the legacy Svelte syntax used in these examples.

```svelte{6-8,13,14,17}
<script lang="ts">
  import MyButton from './MyButton.svelte'

  export let Hst

  let disabled = false
  let text = ''
  let content = 'Click me!'
</script>

<Hst.Story>
  <Hst.Variant>
    <MyButton {disabled}>
      {content}
    </MyButton>

    <input bind:value={text}>
  </Hst.Variant>
</Hst.Story>
```

## Controls panel

Add inputs or components to the `controls` slot on `<Hst.Variant>`. Put the slot on `<Hst.Story>` to share a default across variants.

```svelte{16-19}
<script>
  import MyButton from './MyButton.svelte'

  export let Hst

  let disabled = false
  let content = 'Hello world'
</script>

<Hst.Story>
  <Hst.Variant>
    <MyButton {disabled}>
      {content}
    </MyButton>

    <svelte:fragment slot="controls">
      Content: <input type="text" bind:value={content} />
      Disabled: <input type="checkbox" bind:checked={disabled} />
    </svelte:fragment>
  </Hst.Variant>
</Hst.Story>
```

You can also share the same default controls for all variants by putting the slot directly under the `<Hst.Story>` component:

```svelte{2-5}
<Hst.Story>
  <svelte:fragment slot="controls">
    Content: <input type="text" bind:value={content} />
    Disabled: <input type="checkbox" bind:checked={disabled} />
  </svelte:fragment>

  <Hst.Variant title="Variant 1">
    <MyButton {disabled}>
      {content}
    </MyButton>
    <!-- Reusing controls -->
  </Hst.Variant>

  <Hst.Variant title="Variant 2">
    <MyButton {disabled}>
      {content}
    </MyButton>
    <!-- Reusing controls -->
  </Hst.Variant>
</Hst.Story>
```

A variant can then override the slot if needed.

## Built-in controls {#builtin-controls}

Use built-in fields and buttons when you want controls that match the workbench.

```svelte{17-18}
<script>
  import MyButton from './MyButton.svelte'

  export let Hst

  let disabled = false
  let content = 'Hello world'
</script>

<Hst.Story>
  <Hst.Variant>
    <MyButton {disabled}>
      {content}
    </MyButton>

    <svelte:fragment slot="controls">
      <Hst.Text bind:value={content} title="Content" />
      <Hst.Checkbox bind:value={disabled} title="Disabled" />
    </svelte:fragment>
  </Hst.Variant>
</Hst.Story>
```

Browse the [built-in controls book](https://controls.histoire.dev/) for examples.
