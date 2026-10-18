<script lang="ts" setup>
import PiniaStore from './PiniaStore.vue'
</script>

<template>
  <Story :meta="{ wrapper: false }" title="PiniaStory">
    <div class="example-stage">
      <PiniaStore />
    </div>
  </Story>
</template>
