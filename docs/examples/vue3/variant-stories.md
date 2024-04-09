# Story with variants

These patterns let you create several variants of your component to visualize several state of your component.

## Isolated

This will display variants as separate pages that you can navigate into. This view will be the same as single stories, and you will be able to resize your components.

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'
</script>

<template>
  <Story title="MyStory">
    <Variant title="MyVariant 1">
      <MyComponent argument="hello" />
    </Variant>
    <Variant title="MyVariant 2">
      <MyComponent argument="world" />
    </Variant>
  </Story>
</template>
```

## Grid

This will display variants in a grid for you to visualize all the variants in the same page. Though, you must fix the width (it can be a percentage).

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'
</script>

<template>
  <Story
    title="MyStory"
    :layout="{ type: 'grid', width: '200px' }"
  >
    <Variant title="MyVariant 1">
      <MyComponent argument="hello" />
    </Variant>
    <Variant title="MyVariant 2">
      <MyComponent argument="world" />
    </Variant>
  </Story>
</template>
```

## Auto generated grid

When you have a lot of variant to test, it can be easier to auto generated them with this pattern.

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'

const args = ['hello', 'world', 'etc', '...']
</script>

<template>
  <Story
    title="MyStory"
    :layout="{ type: 'grid', width: '200px' }"
  >
    <Variant
      v-for="(argument, key) of args"
      :key="key"
      :title="`MyVariant ${key}`"
    >
      <MyComponent :argument="argument" />
    </Variant>
  </Story>
</template>
```

## Auto generated grid with props binding

When your variants have a lot of arguments, you can use this pattern.

```vue
<script lang="ts" setup>
import MyComponent from './MyComponent.vue'

const propsVariants = [
  { argument: 'hello', color: 'red', count: 4 },
  { argument: 'world', color: 'blue', count: 5 },
  { argument: 'etc', color: 'violet', count: 6 },
]
</script>

<template>
  <Story
    title="MyStory"
    :layout="{ type: 'grid', width: '200px' }"
  >
    <Variant
      v-for="(props, key) of propsVariants"
      :key="key"
      :title="`MyVariant ${key}`"
    >
      <MyComponent v-bind="props" />
    </Variant>
  </Story>
</template>
```
