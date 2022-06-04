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

<script setup lang="ts">
const props = defineProps<{
  to?: string
  variant: 'primary' | 'secondary'
}>()

// eslint-disable-next-line no-undef
const computedClasses = computed(() => ({
  'btn-base': true,
  'btn-primary': props.variant === 'primary',
}))
</script>

<style scoped>
.btn-base {
  padding: 7px 14px;
}

.btn-primary {
  background: black;
  color: white;
}
</style>
