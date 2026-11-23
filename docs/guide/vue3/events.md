# Events

Call `logEvent(name, payload)` from `histoire/client` in an event handler. Select the event in the inspector’s **Events** tab to inspect its payload.

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
