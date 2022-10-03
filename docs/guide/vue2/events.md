# Events

Histoire can display a list of events emitted from your story. To register new events, use the `logEvent` function from `histoire/client`.

The first parameter is the name of the event, and the second one is a data object you want to display when clicking on the event.

```vue{3,10,11}
<script lang="ts" setup>
import EventButton from './EventButton.vue'
import { logEvent } from 'histoire/client'
</script>

<template>
  <Story
    title="events/EventButton"
  >
    <EventButton @myEvent="logEvent('My event', $event)" /><br>
    <button @click="logEvent('Click', $event)">
      Click
    </button>
  </Story>
</template>
```
