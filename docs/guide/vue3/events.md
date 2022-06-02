# Events

Histoire can display a list of events emitted from your story. To register new events, use the `hstEvent` function from `histoire/client`.

The first parameter is the name of the event, and the second one is a data object you want to display when clicking on the event.

```vue
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
```
