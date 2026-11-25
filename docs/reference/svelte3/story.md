# Hst.Story

Create a story. Must be at the top level of the story file.

## `title`

Title of the story.

```svelte
<Hst.Story title="My story">
  Hello world
</Hst.Story>
```

## `id`

Id of the story used in the URL. By default, the id is automatically generated from the file path. Setting an id manually will ensure the URL parameter doesn't change with the order of the variants in the story.

```svelte
<Hst.Story id="my-story">
  Hello world
</Hst.Story>
```

## `layout`

Layout of the story. Object with the following properties:
  - `type` (optional): `'single'` or `'grid'`; omitted, the story follows the default arrangement
  - `width` (optional): variant width in pixels in Grid and List, instead of the canvas viewport width
  - `height` (optional): variant height in pixels in Grid and List, instead of the canvas viewport height
  - `padding` (optional): space in pixels around each variant in Grid, List and Single, with aligners marking its corners; defaults to [`ui.framePadding`](../config.md#ui-framepadding)

[Learn more](../../guide/svelte3/stories.md#layout)

See [runtime migration guide](../../guide/testing.md#state-ownership) for non-serializable state and custom controls.

## `group`

The id of a group to include the story in.

```svelte
<Hst.Story group="my-group">
  Hello world
</Hst.Story>
```

[Learn more](../../guide/svelte3/hierarchy.md#groups)

## `icon`

An [Iconify id](https://icones.js.org/) to customize the story icon in the tree.

```svelte
<Hst.Story icon="lucide:cpu">
  Hello world
</Hst.Story>
```

## `iconColor`

The icon color.

```svelte
<Hst.Story icon-color="#8B5CF6">
  Hello world
</Hst.Story>
```

## `source`

The copyable source code of the story.

```svelte
<script>
  export let Hst

  const source = `<h1>Toto</h1>

<input
  v-model.number="count"
  type="number"
>`
</script>

<Hst.Story {source}>
  <!-- ... -->
</Hst.Story>
```

## `responsiveDisabled`

Disables the responsive menu, preview resize handles and makes the preview laways fit the available space.

```svelte
<Hst.Story responsiveDisabled>
  <!-- ... -->
</Hst.Story>
```

## `autoPropsDisabled`

Disables the automatic detection of props of the components in the story.

```svelte
<Hst.Story autoPropsDisabled>
  <!-- ... -->
</Hst.Story>
```

## `meta`

JSON metadata published in the story catalog for plugins, for example `design` for [@histoire/plugin-designs](../../guide/plugins/designs.md). Functions and components are left out. Large or deeply nested metadata is left out of the catalog with a warning; keep each story or variant `meta` under 64 KiB.

```svelte
<Hst.Story meta={{ design: { type: 'figma', url: 'https://www.figma.com/design/KEY/Button' } }}>
  <!-- ... -->
</Hst.Story>
```

## Slot: `controls`

Content of the 'Controls' pane used to interact with the story. This will be the default content for variants of the story but you can override it by defining a `controls` slot in a variant.

```svelte
<Hst.Story>
  <svelte:fragment slot="controls">
    <!-- Interact with state here -->
  </svelte:fragment>

  <Hst.Variant>
    <!-- Controls reused here -->
  </Hst.Variant>
</Hst.Story>
```

[Learn more](../../guide/vue3/controls.md#controls-panel)
