<script lang="ts" setup>
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'myEvent', value: { a: string, b: string }): void
}>()

const value1 = ref('Hello')
const value2 = ref('World')

function sendEvent () {
  emit('myEvent', { a: value1.value, b: value2.value })
}
</script>

<template>
  <input
    v-model="value1"
    type="text"
  >
  <input
    v-model="value2"
    type="text"
  >
  <button @click="sendEvent">
    Send
  </button>
</template>
