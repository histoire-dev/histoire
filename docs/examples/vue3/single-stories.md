# Single stories

The default way to display stories and variants is inside an iframe that renders a single variant. The iframe is needed for CSS media queries to work properly and to isolate your application's styles.

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'
</script>

<template>
  <Story title="MyStory">
    <MyComponent />
  </Story>
</template>
```

This example is equivalent to:

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'
</script>

<template>
  <Story
    title="MyStory"
    :layout="{ type: 'single' }"
  >
    <MyComponent />
  </Story>
</template>
```
