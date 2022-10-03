# How to write stories?

Stories are svelte files ending with `.story.svelte`. Add a `Hst` prop so histoire can provide its builtin components. You then need to use the `<Hst.Story>` tag at the root of your template.

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
We use a prop instead of an import because Histoire provides different implementations of those components in different situations (for example when collecting the stories).
:::

The title of the story is provided with the (optional) `title` prop:

```svelte
<script>
  export let Hst
</script>

<Hst.Story title="🐱 Meow">
  🐱
</Hst.Story>
```

You can of course add `<style>` sections just like you would with any `.svelte` file.

For example, you will usually import and use a component in your story:

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

Stories can have different variants representing the same component. You can define variants using the `<Hst.Variant>` tag. Similar to the story, you can provide a title to your variant with the `title` prop.

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

You can change the layout of the variant by using the `layout` prop with an object. The `type` property is required to specify which layout to use.

### Single layout

This is the default layout, displaying one variant at a time. The default behavior is to isolate the story with an iframe. 

Additional `layout` properties:
- `iframe`: (default: `true`) enables the iframe, useful when your CSS has media queries for responsive design.

```svelte{7}
<script>
  export let Hst
</script>

<Hst.Story
  title="Cars"
  layout={{ type: 'single', iframe: true }}
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

Display all the variants in a grid.

Additional `layout` properties:
- `width`: Column size. Can be number (pixels) or string (like `'100%'`).

```svelte{7}
<script>
  export let Hst
</script>

<Hst.Story
  title="Cars"
  layout={{ type: 'grid', width: 200 }}
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
