# Hst.Variant

Create different sub stories around the same component by using the `<Hst.Variant>` tag multiple times inside the same `<Hst.Story>` tag.

## `title`

Title of the variant.

```svelte
<Hst.Story title="Cars">
  <Hst.Variant title="default">
    🚗
  </Hst.Variant>
  <Hst.Variant title="Fast">
    🏎️
  </Hst.Variant>
  <Hst.Variant title="Slow">
    🚜
  </Hst.Variant>
</Hst.Story>
```

## `id`

Id of the variant used in the URL. By default, the id is automatically generated with the index of the variant in the list. Setting an id manually will ensure the URL parameter doesn't change with the order of the variants in the story.

```svelte
<Hst.Story>
  <Hst.Variant id="default">
    🚗
  </Hst.Variant>
  <Hst.Variant id="fast">
    🏎️
  </Hst.Variant>
  <Hst.Variant id="slow">
    🚜
  </Hst.Variant>
</Hst.Story>
```

## `icon`

An [Iconify id](https://icones.js.org/) to customize the variant icon in the UI.

```svelte
<Hst.Story>
  <Hst.Variant icon="lucide:car">
    🚗
  </Hst.Variant>
</Hst.Story>
```

## `iconColor`

The icon color.

```svelte
<Hst.Story>
  <Hst.Variant icon-color="#8B5CF6">
    🚗
  </Hst.Variant>
</Hst.Story>
```

## `source`

The copyable source code of the variant.

```svelte
<script>
  export let Hst

  const source = `<h1>Toto</h1>

<input
  v-model.number="count"
  type="number"
>`
</script>

<Hst.Story>
  <Hst.Variant {source}>
    <!-- ... -->
  </Hst.Variant>
</Hst.Story>
```

## `responsiveDisabled`

Disables the responsive menu, preview resize handles and makes the preview laways fit the available space.

```svelte
<Hst.Story>
  <Hst.Variant responsiveDisabled>
    <!-- ... -->
  </Hst.Variant>
</Hst.Story>
```

## `autoPropsDisabled`

Disables the automatic detection of props of the components in the story.

```svelte
<Hst.Story>
  <Hst.Variant autoPropsDisabled>
    <!-- ... -->
  </Hst.Variant>
</Hst.Story>
```

## Slot: `default`

Content of the variant.

```svelte
<Hst.Story>
  <Hst.Variant>
    <pre>{{ state }}</pre>
  </Hst.Variant>
</Hst.Story>
```

## Slot: `controls`

Content of the 'Controls' pane used to interact with the story.

```svelte
<Hst.Story>
  <Hst.Variant>
    <svelte:fragment slot="controls">
      <!-- Interact with state here -->
    </svelte:fragment>
  </Hst.Variant>
</Hst.Story>
```

[Learn more](../../guide/svelte3/controls.md#controls-panel)
