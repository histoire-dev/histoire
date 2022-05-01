<script lang="ts" setup>
import { computed } from 'vue'
import { HstEvent } from '../../stores/events'

const props = defineProps<{
  event: HstEvent
}>()

const formattedArgument = computed(() => {
  console.log(typeof props.event.argument)
  switch (typeof props.event.argument) {
    case 'string':
      return `"${props.event.argument}"`
    case 'object':
      return `{ ${Object.keys(props.event.argument).map((key) => `${key}: ${props.event.argument[key]}`).join(', ')} }`
    default:
      return props.event.argument
  }
})

function printToConsole () {
  console.log(JSON.parse(JSON.stringify(props.event))) // Remove the proxy and log to the console
}
</script>

<template>
  <div
    class="htw-cursor-pointer odd:htw-bg-gray-100 dark:odd:htw-bg-gray-750 htw-py-2 htw-px-4"
    title="Click to print the event in the console"
    @click="printToConsole"
  >
    {{ event.name }}
    <span
      v-if="event.argument"
      class="htw-text-xs htw-opacity-50 htw-pl-2"
    >{{ formattedArgument }}</span>
  </div>
</template>
