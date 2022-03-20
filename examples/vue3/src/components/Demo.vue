<script lang="ts" setup>
defineProps<{
  message: string
}>()
</script>

<template>
  <div class="hello">
    {{ message }}
  </div>
</template>

<style scoped>
.hello {
  font-size: 24px;
  color: #00bebe;
}
</style>
