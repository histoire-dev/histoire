<script lang="ts" setup>
import EventButton from './EventButton.vue'
import { hstEvent } from 'histoire/client'
</script>

<template>
  <Story
    title="events/EventButton"
  >
    <EventButton @myEvent="hstEvent('My event', $event)" /><br>
    <button @click="hstEvent('Click', $event)">
      Click
    </button>
  </Story>
</template>
