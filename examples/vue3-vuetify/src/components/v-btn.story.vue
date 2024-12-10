<script setup>
import { logEvent } from 'histoire/client'
import { ref } from 'vue'

const text = ref('Click me!')
</script>

<template>
  <Story>
    <v-btn
      @click="logEvent('click', $event)"
    >
      {{ text }}
    </v-btn>

    <template #controls>
      <HstText
        v-model="text"
        title="Default slot"
      />
    </template>
  </Story>
</template>
