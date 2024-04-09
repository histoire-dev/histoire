<script lang="ts" setup>
import { logEvent } from 'histoire/client'
import EventButton from './EventButton.vue'
</script>

<template>
  <Story
    title="events/EventButtonGrid"
    :layout="{ type: 'grid', width: 500 }"
  >
    <Variant
      v-for="n in 9"
      :key="n"
      :title="`Variant ${n}`"
    >
      <EventButton @my-event="logEvent('My event', $event)" /><br>
      <button @click="logEvent('Click', $event)">
        Click
      </button>
    </Variant>
  </Story>
</template>
