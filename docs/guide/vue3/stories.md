# How to write stories?

Stories are vue files ending with `.story.vue`. You just need to use the `<Story>` tag at the root of your template.

```vue
<!-- Meow.story.vue -->
<template>
  <Story>
    🐱
  </Story>
</template>
```

The title of the story is provided with the (optional) `title` prop:

```vue
<template>
  <Story title="🐱 Meow">
    🐱
  </Story>
</template>
```

You can of course add `<style>` and/or `<script>` elements just like you would with any `.vue` file.

For example, you will usually import and use a component in your story:

```vue
<!-- Meow.story.vue -->
<script setup>
import Meow from './Meow.vue'
</script>

<template>
  <Story>
    <Meow />
  </Story>
</template>
```

## Variants

Stories can have different variants representing the same component. You can define variants using the `<Variant>` tag. Similar to the story, you can provide a title to your variant with the `title` prop.

```vue{3-11}
<template>
  <Story title="Cars">
    <Variant title="default">
      🚗
    </Variant>
    <Variant title="Fast">
      🏎️
    </Variant>
    <Variant title="Slow">
      🚜
    </Variant>
  </Story>
</template>
```

## Layout

You can change the layout of the variant by using the `layout` prop with an object. The `type` property is required to specify which layout to use.

### Single layout

This is the default layout, displaying one variant at a time. The story is isolated with an iframe so CSS media queries work correctly.

Additional `layout` properties:
- `iframe`: **Deprecated** — this option is ignored, stories always render inside an iframe.

Remove `iframe: false` when migrating. Preview runtime owns live state; see [browser runtime migration](../testing.md#state-ownership).

```vue{4}
<template>
  <Story
    title="Cars"
    :layout="{ type: 'single' }"
  >
    <Variant title="default">
      🚗
    </Variant>
    <Variant title="Fast">
      🏎️
    </Variant>
    <Variant title="Slow">
      🚜
    </Variant>
  </Story>
</template>
```

### Grid layout

Display all the variants in a grid.

Additional `layout` properties:
- `width`: Column size. Can be number (pixels) or string (like `'100%'`).

```vue{4}
<template>
  <Story
    title="Cars"
    :layout="{ type: 'grid', width: 200 }"
  >
    <Variant title="default">
      🚗
    </Variant>
    <Variant title="Fast">
      🏎️
    </Variant>
    <Variant title="Slow">
      🚜
    </Variant>
  </Story>
</template>
```
