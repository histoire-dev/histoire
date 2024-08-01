<script lang="ts" setup>
import NoButton from './NoButton.vue'
</script>

<template>
  <Story
    title="NoButton"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant
      title="no button"
    >
      <NoButton />
    </Variant>
  </Story>
</template>
