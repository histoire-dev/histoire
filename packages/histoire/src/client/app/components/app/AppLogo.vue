<script lang="ts" setup>
import { isDark } from '../../util/dark'
</script>

<template>
  <img
    v-if="isDark"
    src="../../assets/histoire-text-dark.svg"
    alt="Histoire logo"
  >
  <img
    v-else
    src="../../assets/histoire-text.svg"
    alt="Histoire logo"
  >
</template>
