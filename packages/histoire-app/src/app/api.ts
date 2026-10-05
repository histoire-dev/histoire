import { isDark as _isDark } from './util/dark.js'

export { toggleDark } from './util/dark.js'

export { logEvent } from './util/events.js'
export { useHostChannel } from './util/host-channel.js'
export type { HistoireStoryHostChannel } from './util/host-channel.js'
export { useHistoireGlobals, useHistoireGlobalsStore } from '@histoire/shared'

export function isDark() {
  return _isDark.value
}
