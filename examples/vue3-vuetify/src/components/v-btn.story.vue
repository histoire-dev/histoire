<script setup>
import { ref } from 'vue'
import { hstEvent } from 'histoire/client'

const text = ref('Click me!')
</script>

<template>
  <Story>
    <v-btn
      @click="hstEvent('click', $event)"
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
