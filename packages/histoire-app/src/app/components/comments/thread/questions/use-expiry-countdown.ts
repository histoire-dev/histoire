import type { MaybeRefOrGetter } from 'vue'
import { computed, onBeforeUnmount, ref, toValue } from 'vue'

/** Remaining time under which the countdown becomes visible. */
const VISIBLE_UNDER_MS = 120_000

/**
 * Formats milliseconds as `m:ss`, rounding up so "0:00" only shows once expired.
 * @param ms Remaining milliseconds.
 */
function format(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Ticking "m:ss" label for the time left before a request expires,
 * only set during the last two minutes. The timer is cleared on unmount.
 * @param expiresAt ISO expiry time.
 */
export function useExpiryCountdown(expiresAt: MaybeRefOrGetter<string>) {
  const now = ref(Date.now())
  const timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  onBeforeUnmount(() => clearInterval(timer))
  return computed(() => {
    const left = Date.parse(toValue(expiresAt)) - now.value
    return Number.isFinite(left) && left < VISIBLE_UNDER_MS ? format(left) : undefined
  })
}
