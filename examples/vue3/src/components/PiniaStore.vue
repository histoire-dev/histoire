<script setup lang="ts">
import { useMyStore } from '../lib/myStore'

const myStore = useMyStore()
</script>

<template>
  <div class="example-row">
    <button type="button" class="example-button" @click="myStore.myValue++">
      +1
    </button>
    <span class="example-value">
      {{ myStore.myValue }}
    </span>
  </div>
</template>
