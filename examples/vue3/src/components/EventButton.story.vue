<script lang="ts" setup>
import { logEvent } from 'histoire/client'
import EventButton from './EventButton.vue'
</script>

<template>
  <Story
    title="events/EventButton"
  >
    <EventButton @my-event="logEvent('My event', $event)" /><br>
    <button @click="logEvent('Click', $event)">
      Click
    </button>
  </Story>
</template>
