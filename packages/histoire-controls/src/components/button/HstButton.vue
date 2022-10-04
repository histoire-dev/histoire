
<script lang="ts">
export default {
  name: 'HstButton',
}
</script>

<script setup lang="ts">

</script>

<template>
  <button class="htw-text-gray-900 dark:htw-text-gray-100 htw-p-2 htw-rounded-sm active htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black htw-cursor-pointer">
    <slot />
  </button>
</template>
