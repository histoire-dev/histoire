<template>
  <Story :meta="{ wrapper: false }" title="Docs" icon="carbon:notebook">
    <Variant title="default">
      <div class="example-stage">
        I have docs!
      </div>
    </Variant>
  </Story>
</template>

<docs lang="md">
# Component documentation

Stories can include usage notes and code beside rendered component.

## Usage

```vue
<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <p>{{ message }}</p>
</template>
```

Use **Props** to edit values and **Source** to inspect selected variant.

[Histoire documentation](https://histoire.dev/)
</docs>
