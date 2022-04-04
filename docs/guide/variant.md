# Story variants

Stories can have different variants representing the same component. You can define variants using the `<Variant>` tag. Same as story, you can provide a title to your variant with the `title` attribute.

```vue{3-11}
<template>
  <Story title="Cars">
    <Variant title="default">
      🚗
    </Variant>
    <Variant title="Speedy">
      🏎️
    </Variant>
    <Variant title="Slowy">
      🚜
    </Variant>
  </Story>
</template>
```

## Layout

You can change the layout of the variant by using the `layout` attribute.
- `type`: `single` or `grid`
- `width`: only if it's a grid, can be number (pixels) or string (like `100%`)

```vue{4}
<template>
  <Story
    title="Cars"
    :layout="{ type: 'grid', width: 200 }"
  >
    <Variant title="Speedy">
      🏎️
    </Variant>
    <Variant title="Slowy">
      🚜
    </Variant>
  </Story>
</template>

```
