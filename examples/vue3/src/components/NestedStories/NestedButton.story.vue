<script lang="ts" setup>
import NestedButton from './NestedButton.vue'
</script>

<template>
  <Story title="NestedButton">
    <Variant title="default">
      <NestedButton>
        <template #default>
          Click me
        </template>
      </NestedButton>
    </Variant>
  </Story>
</template>
