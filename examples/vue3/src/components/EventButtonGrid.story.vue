<script lang="ts" setup>
import EventButton from './EventButton.vue'
import { hstEvent } from 'histoire/client'
</script>

<template>
  <Story
    title="events/EventButtonGrid"
    :layout="{ type: 'grid', width: 500 }"
  >
    <EventButton @myEvent="hstEvent('My event', $event)" /><br>
    <button @click="hstEvent('Click', $event)">
      Click
    </button>
  </Story>
</template>
