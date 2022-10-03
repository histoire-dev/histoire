<script lang="ts" setup>
import EventButton from './EventButton.vue'
import { logEvent } from 'histoire/client'
</script>

<template>
  <Story
    title="events/EventButtonGrid"
    :layout="{ type: 'grid', width: 500 }"
  >
    <EventButton @myEvent="logEvent('My event', $event)" /><br>
    <button @click="logEvent('Click', $event)">
      Click
    </button>
  </Story>
</template>
