<script lang="ts" setup>
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'myEvent', value: { a: string, b: string }): void
}>()

const value1 = ref('Hello')
const value2 = ref('World')

/** Sends current field values through story event contract. */
function sendEvent() {
  emit('myEvent', { a: value1.value, b: value2.value })
}
</script>

<template>
  <div class="example-stack">
    <label class="example-field">
      First value
      <input v-model="value1" class="example-input" type="text">
    </label>
    <label class="example-field">
      Second value
      <input v-model="value2" class="example-input" type="text">
    </label>
    <button type="button" class="example-button" @click="sendEvent">
      Send
    </button>
  </div>
</template>
