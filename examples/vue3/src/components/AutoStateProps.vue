<script lang="ts" setup>
defineProps({
  name: {
    type: String,
    default: 'world',
  },
})
</script>

<template>
  Hello {{ name }}!
</template>
