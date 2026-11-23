# Wrapper

Use a wrapper to surround each rendered variant with a provider or shared layout.

Register wrapper components with `addWrapper` in your [setup file](./app-setup.md).

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import WrapperGlobal from './histoire/GlobalWrapper.vue'

export const setupVue3 = defineSetupVue3(({ addWrapper }) => {
  addWrapper(WrapperGlobal)
})
```

Each wrapper renders its contents through the default slot. Histoire applies wrappers to rendered stories and controls. Collection and the hidden mount that registers variants run without wrappers, so install dependencies needed during story setup with `app.use()` or `app.provide()`.

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

The wrapper adds padding and a border. Set `meta.wrapper` to `false` on a story or variant to remove those styles.

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
