<script setup>
import { ref } from 'vue'
import { logEvent } from 'histoire/client'

const text = ref('Click me!')
</script>

<template>
  <Story :layout="{ type: 'grid', width: 200 }">
    <Variant title="default">
      <v-btn :active="false" @click="logEvent('click', $event)">
        {{ text }}
      </v-btn>
    </Variant>
    <Variant title="primary">
      <v-btn color="primary" :active="false" @click="logEvent('click', $event)">
        {{ text }}
      </v-btn>
    </Variant>

    <template #controls>
      <HstText v-model="text" title="Default slot" />
    </template>
  </Story>
</template>
