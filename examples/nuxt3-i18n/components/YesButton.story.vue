<script lang="ts" setup>
import YesButton from './YesButton.vue'
</script>

<template>
  <Story
    title="YesButton"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant
      title="yes button"
      icon="el:resize-full"
    >
      <YesButton />
    </Variant>
  </Story>
</template>
