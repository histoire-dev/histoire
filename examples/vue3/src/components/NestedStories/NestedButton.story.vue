<script lang="ts" setup>
import NestedButton from './NestedButton.vue'
</script>

<template>
  <Story :meta="{ wrapper: false }" title="NestedButton">
    <Variant title="default">
      <div class="example-stage">
        <NestedButton class="example-button">
          <template #default>
            Click me
          </template>
        </NestedButton>
      </div>
    </Variant>
  </Story>
</template>
