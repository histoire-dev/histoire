# How to write stories?

Create a Svelte file ending in `.story.svelte`, export the `Hst` prop, and put `<Hst.Story>` at the root of its template.

```svelte
<!-- Meow.story.svelte -->
<script>
  export let Hst
</script>

<Hst.Story>
  🐱
</Hst.Story>
```

::: tip
Histoire uses the `Hst` prop to supply the components appropriate for story collection or rendering.
:::

Set the optional `title` prop to name the story in the workbench.

```svelte
<script>
  export let Hst
</script>

<Hst.Story title="🐱 Meow">
  🐱
</Hst.Story>
```

Import and render your components as you would in any Svelte file.

```svelte{2,7}
<script>
  import Meow from './Meow.svelte'
  export let Hst
</script>

<Hst.Story>
  <Meow/>
</Hst.Story>
```

## TypeScript

To get typings for the `Hst` prop, you can import the `Hst` type from `@histoire/plugin-svelte`:

```svelte
<script lang="ts">
  import type { Hst } from '@histoire/plugin-svelte'
  export let Hst: Hst
</script>

<Hst.Story> <!-- Typed! -->
  🐱
</Hst.Story>
```

## Variants

Use variants to show different states or use cases. Add each variant with the `<Hst.Variant>` tag. Give each variant a readable `title`, such as “Disabled”.

```svelte{6-14}
<script>
  export let Hst
</script>

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

## Layout

Set the story’s `layout.type` to choose how its variants appear. For stories without an explicit layout, Histoire uses your local or project default, which falls back to Grid. A view in the URL or a remembered view can override the story layout.

### Single layout

Use `type: "single"` to display one variant at a time. The variant runs in an iframe so CSS media queries use its own viewport.

Stories always render inside an iframe. Remove the `iframe` option when migrating. The story iframe owns live state. See [state ownership during migration](../testing.md#state-ownership).

```svelte{7}
<script>
  export let Hst
</script>

<Hst.Story
  title="Cars"
  layout={{ type: 'single' }}
>
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

### Grid layout

Use `type: "grid"` to compare variants side by side.

```svelte{7}
<script>
  export let Hst
</script>

<Hst.Story
  title="Cars"
  layout={{ type: 'grid' }}
>
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
