import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

export type HstEvent = {
  name: string
  argument: unknown
}

export const useEventsStore = defineStore('events', () => {
  const events = reactive<Array<HstEvent>>([])
  const unseen = ref(0)

  function addEvent (event: HstEvent) {
    events.push(event)
    unseen.value++
  }

  return {
    addEvent,
    events,
    unseen,
  }
})
