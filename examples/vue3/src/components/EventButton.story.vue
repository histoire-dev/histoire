<script lang="ts" setup>
import { logEvent } from 'histoire/client'
import EventButton from './EventButton.vue'
</script>

<template>
  <Story
    :meta="{ wrapper: false }"
    title="events/EventButton"
  >
    <div class="example-stage example-stack">
      <EventButton @my-event="logEvent('My event', $event)" />
      <button class="example-button" @click="logEvent('Click', $event)">
        Click
      </button>
    </div>
  </Story>
</template>
