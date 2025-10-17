<script setup lang="ts">
</script>

<template>
  <div class="my-button">
    This should have a blue border
  </div>
</template>

<style scoped>
@layer components {
    .my-button {
        border: 1px solid blue;
        background-color: transparent;
        color: blue;
    }
}
</style>
