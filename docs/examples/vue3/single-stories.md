# Single stories

Here are some pattern examples to test your component without any variant. This is the simplest way to get you started.

## Within an iframe

This will display your component inside an iframe to be able to test the responsiveness correctly. The iframe is needed for CSS media queries to work properly.

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

## Integrated

This will integrate your component directly in the app. The advantage being that you can pass complex arguments (such as functions or recursive object), but responsiveness won't work for CSS media queries.

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'
</script>

<template>
  <Story
    title="MyStory"
    :layout="{ type: 'single', iframe: false }"
  >
    <MyComponent />
  </Story>
</template>
```

