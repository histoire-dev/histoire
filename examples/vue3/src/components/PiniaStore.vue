<script setup lang="ts">
import { useMyStore } from '../lib/myStore'

const myStore = useMyStore()
</script>

<template>
  <button @click="myStore.myValue++">
    +1
  </button>
  <span>
    {{ myStore.myValue }}
  </span>
</template>
