# Wrapper

A Wrapper allows you to render things around the displayed story/variant.

In your [setup file](./app-setup.md), you can add wrapper components with `addWrapper`:

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import WrapperGlobal from './histoire/GlobalWrapper.vue'

export const setupVue3 = defineSetupVue3(({ addWrapper }) => {
  addWrapper(WrapperGlobal)
})
```

The rendering will recursively occur in all the wrappers `default` slot.

## Controls wrappers <Badge type="tip" text="1.0-beta.2+" />

Wrappers also surround custom controls by default. Pass `{ controls: false }` for visual wrappers that should not add layout around inspector controls:

```ts
addWrapper(WrapperGlobal, { controls: false })
```

This keeps provider wrappers enabled for controls unless they opt out.

## Wrapper example

Here is an example for a wrapper component:

```vue
<script lang="ts" setup>
import { Story, Variant } from 'histoire'

const props = defineProps<{
  story: Story
  variant?: Variant
}>()

function hasWrapper() {
  return props.story.meta?.wrapper !== false
    && props.variant?.meta?.wrapper !== false
}
</script>

<template>
  <div
    class="global-wrapper"
    :style="hasWrapper() ? 'padding: 0.25rem; border: solid 1px rgba(0, 0, 0, 0.05);' : ''"
  >
    <slot />
  </div>
</template>
```

Now, all stories and variants will be rendered with a small padding and a border.

In the above example, we also use the `meta` prop to allow disabling the wrapper style:

```vue
<template>
  <Story>
    <Variant title="With wrapper">
      🙀
    </Variant>
    <Variant
      title="Without wrapper"
      :meta="{ wrapper: false }"
    >
      😼
    </Variant>
  </Story>
</template>
```
