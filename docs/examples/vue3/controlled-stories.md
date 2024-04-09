# Controlled stories

These patterns let you create custom controls to update your component

## Single control

This will display a control panel for the story.

```vue
<script lang="ts" setup>
import { reactive } from 'vue'
import MyComponent from './MyComponent.vue'

const state = reactive({
  text: 'Hello world'
})
</script>

<template>
  <Story title="MyStory">
    <MyComponent :argument="state.text" />
    <template #controls>
      <HstText v-model="state.text" title="Content" />
    </template>
  </Story>
</template>
```

## Global variant control

This will display a control panel for all the variants.

```vue
<script lang="ts" setup>
import { reactive } from 'vue'
import MyComponent from './MyComponent.vue'

const state = reactive({
  text: 'Hello world'
})
</script>

<template>
  <Story title="MyStory">
    <Variant title="MyVariant Red">
      <MyComponent :argument="state.text" color="red" />
    </Variant>
    <Variant title="MyVariant Blue">
      <MyComponent :argument="state.text" color="blue" />
    </Variant>
    <template #controls>
      <HstText v-model="state.text" title="Content" />
    </template>
  </Story>
</template>
```

## Specific variant control

This will display a control panel only for one variant.

```vue
<script lang="ts" setup>
import { reactive } from 'vue'
import MyComponent from './MyComponent.vue'

const state = reactive({
  text: 'Hello world'
})
</script>

<template>
  <Story title="MyStory">
    <Variant title="MyVariant Red">
      <MyComponent :argument="state.text" color="red" />
      <template #controls>
        <HstText v-model="state.text" title="Content" />
      </template>
    </Variant>
    <Variant title="MyVariant Blue">
      <MyComponent argument="hello" color="blue" />
    </Variant>
  </Story>
</template>
```

## Isolated variant control

This will isolate each variant so that you control only one variant at a time.

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'

function initState() {
  return {
    text: 'Hello world'
  }
}
</script>

<template>
  <Story title="MyStory">
    <Variant
      title="MyVariant Red"
      :init-state="initState"
    >
      <template #default="{ state }">
        <MyComponent :argument="state.text" color="red" />
      </template>
      <template #controls="{ state }">
        <HstText v-model="state.text" title="Content" />
      </template>
    </Variant>
    <Variant
      title="MyVariant Blue"
      :init-state="initState"
    >
      <template #default="{ state }">
        <MyComponent :argument="state.text" color="blue" />
      </template>
      <template #controls="{ state }">
        <HstText v-model="state.text" title="Content" />
      </template>
    </Variant>
  </Story>
</template>
```
