# How to write stories?

Create a Vue file ending in `.story.vue` and put `<Story>` at the root of its template.

```vue
<!-- Meow.story.vue -->
<template>
  <Story>
    🐱
  </Story>
</template>
```

Set the optional `title` prop to name the story in the workbench.

```vue
<template>
  <Story title="🐱 Meow">
    🐱
  </Story>
</template>
```

Import components and add styles as you would in any Vue file.

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

Use variants to show different states or use cases. Add each variant with the `<Variant>` tag. Give each variant a readable `title`, such as “Disabled”.

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

Set the story’s `layout.type` to choose how its variants appear. For stories without an explicit layout, Histoire uses your local or project default, which falls back to Grid. A view in the URL or a remembered view can override the story layout.

### Single layout

Use `type: "single"` to display one variant at a time. The variant runs in an iframe so CSS media queries use its own viewport.

Stories always render inside an iframe. Remove the `iframe` option when migrating. The story iframe owns live state. See [state ownership during migration](../testing.md#state-ownership).

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

Use `type: "grid"` to compare variants side by side.

Set `width` and `height` to give every variant the same size in Grid and List, whatever viewport is picked in the toolbar. An omitted dimension follows the viewport, or the variant content when the canvas fits content. Set `padding` to leave space around each variant; aligners mark its corners.

```vue{4}
<template>
  <Story
    title="Button"
    :layout="{ type: 'grid', width: 200, height: 80, padding: 24 }"
  >
    <Variant title="default">
      <button>Click me</button>
    </Variant>
  </Story>
</template>
```

```vue{4}
<template>
  <Story
    title="Cars"
    :layout="{ type: 'grid' }"
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
