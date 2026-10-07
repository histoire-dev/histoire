import { isMac } from './env.js'

/** Format command prompt shortcut labels for current platform. */
export function formatKey(key: string) {
  key = key.toLowerCase()
  if (key === 'ctrl') {
    return isMac ? '^' : 'Ctrl'
  }
  if (key === 'alt') {
    return isMac ? '⎇' : 'Alt'
  }
  if (key === 'shift') {
    return '⇧'
  }
  if (key === 'meta') {
    return '⌘'
  }
  if (key === 'enter') {
    return '⏎'
  }
  return key.charAt(0).toUpperCase() + key.substring(1).toLowerCase()
}
