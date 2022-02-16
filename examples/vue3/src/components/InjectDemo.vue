<script lang="ts" setup>
import { inject } from 'vue'

console.log('injecting demo')
const demo = inject('demo')
</script>

<template>
  <div class="demo">
    {{ demo }}
  </div>
</template>
