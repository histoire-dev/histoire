import { isDark as _isDark } from './util/dark.js'

export { toggleDark } from './util/dark.js'

export { logEvent } from './util/events.js'

export function isDark() {
  return _isDark.value
}
