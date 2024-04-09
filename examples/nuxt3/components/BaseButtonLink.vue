<script setup lang="ts">
const props = defineProps<{
  to?: string
  variant: 'primary' | 'secondary'
}>()

const computedClasses = computed(() => ({
  'btn-base': true,
  'btn-primary': props.variant === 'primary',
}))
</script>

<template>
  <NuxtLink
    v-if="to"
    :class="computedClasses"
    :to="to"
  >
    <slot />
  </NuxtLink>
  <button
    v-else
    :class="computedClasses"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn-base {
  padding: 7px 14px;
}

.btn-primary {
  background: black;
  color: white;
}
</style>
