<script lang="ts" setup>
defineProps<{
  isActive?: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate'): void
}>()

function handleNavigate() {
  emit('navigate')
}
</script>

<template>
  <a
    class="istoire-base-list-ite htw:flex htw:items-center htw:gap-2 htw:text-gray-900 htw:dark:text-gray-100"
    :class="[
      $attrs.class,
      isActive
        ? 'active htw:bg-primary-500 htw:hover:bg-primary-600 htw:text-white htw:dark:text-black'
        : 'htw:hover:bg-primary-100 htw:dark:hover:bg-primary-900',
    ]"
    @click="handleNavigate()"
    @keyup.enter="handleNavigate()"
    @keyup.space="handleNavigate()"
  >
    <slot />
  </a>
</template>
