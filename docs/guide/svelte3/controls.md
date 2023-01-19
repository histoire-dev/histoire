# State & Controls

Controls give you the ability to interact with your components arguments.

## Defining state

The first step is to define the state that will be shared to your story. Histoire will automatically synchronize the reactive data of your component. Then you can proceed using your state as usual.

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

    <input bind:value={text} />
  </Hst.Variant>
</Hst.Story>
```

## Controls panel

To create the control panel, Histoire provides a `controls` slot on `<Hst.Variant>` (and `<Hst.Story>`, more on that later). You are free to render any element or components inside the slot.

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

## Builtin controls

To build a control panel a bit more easily, Histoire provides builtin controls with design that fits the rest of the UI.

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

Check out all the available controls in their book: [controls.histoire.dev](https://controls.histoire.dev/).
