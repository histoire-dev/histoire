import { applyState, clone } from '@histoire/shared'
import { watch as _watch } from '@histoire/vendors/vue'

function cleanupState(state: Record<string, any>): Record<string, any> {
  const result = {}
  for (const key in state) {
    if (key === 'Hst') continue
    const value = state[key]
    if (typeof value === 'function') continue
    if (typeof value === 'undefined') continue
    if (value instanceof HTMLElement) continue
    if (typeof value === 'object' && value?.$$) continue
    result[key] = value
  }
  return result
}

/**
 * Serializes a cleaned state for comparison. The state crosses the frame
 * boundary as a structured clone, so it is always serializable; key order is
 * stable because both sides build it from the same object.
 */
function serializeState(state: Record<string, any>): string {
  try {
    return JSON.stringify(state) ?? ''
  }
  catch (e) {
    // A cycle or a non-serializable leaf: treat it as always-changed rather
    // than swallowing a real update.
    return ''
  }
}

/**
 * Keeps a variant's state and a Svelte component's state in sync, in both
 * directions, without echoing an update back to the side it came from.
 *
 * The echo is broken by comparing against the last value that crossed, NOT by
 * a "currently syncing" flag: the component is polled every frame and mounting
 * seeds the state several times, so a flag gets out of phase and then swallows
 * the next *genuine* change instead of the echo.
 */
export function syncState(variantState, onChange: (state) => unknown) {
  /** Serialized last value synced in either direction. */
  let lastSynced: string | null = null

  const _stop = _watch(() => variantState, (value) => {
    if (value == null) return
    const cleaned = cleanupState(value)
    const serialized = serializeState(cleaned)
    if (serialized && serialized === lastSynced) return
    lastSynced = serialized
    onChange(cleaned)
  }, {
    deep: true,
    immediate: true,
  })

  function apply(value) {
    if (value == null) return
    const cleaned = cleanupState(value)
    const serialized = serializeState(cleaned)
    if (serialized && serialized === lastSynced) return
    lastSynced = serialized
    applyState(variantState, clone(cleaned))
  }

  return {
    apply,
    stop() {
      _stop()
    },
  }
}
