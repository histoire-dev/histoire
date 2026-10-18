<script lang="ts" setup>
import Demo from './Demo.vue'
</script>

<template>
  <Story
    :meta="{ wrapper: false }"
    title="Demo"
  >
    <Variant>
      <div class="example-stage">
        <Demo class="example-message" message="Hello world!" />
      </div>
    </Variant>

    <Variant
      title="Variant 2"
      icon="carbon:accessibility-alt"
      icon-color="#00bebe"
      auto-props-disabled
    >
      <div class="example-stage">
        <Demo class="example-message" message="Meow!" />
      </div>
    </Variant>
  </story>
</template>

<docs lang="md">
# Message

Edit `message` in Props to update selected variant.

## Variants

Each variant supplies its own message.

[Histoire documentation](https://histoire.dev/)
</docs>
