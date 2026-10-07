import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

/** Cleaned public client event retained by the host compatibility store. */
export interface HstEvent {
  /** Story-authored event label. */
  name: string
  /** Serializable event payload. */
  argument: unknown
}

/**
 * Host-only fallback for `logEvent`, scoped to the caller's active Pinia.
 * SDK runtime events have their own ownership; callers reset this history explicitly.
 */
export const useEventsStore = defineStore('events', () => {
  /** Host history remains local to this Pinia owner. */
  const events = reactive<Array<HstEvent>>([])
  /** Number of entries awaiting caller acknowledgement. */
  const unseen = ref(0)

  /** Append one already-cleaned client event. */
  function addEvent(event: HstEvent) {
    events.push(event)
    unseen.value++
  }

  /** Clear this owner's history and acknowledgement count. */
  function reset() {
    events.length = 0
    unseen.value = 0
  }

  return {
    addEvent,
    reset,
    events,
    unseen,
  }
})
