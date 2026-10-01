import type { Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { isRef } from 'vue'
import { isMac } from './env.js'

export type KeyboardShortcut = string[]

export type KeyboardHandler = (event: KeyboardEvent) => unknown

export interface KeyboardShortcutOptions {
  event?: 'keyup' | 'keydown' | 'keypress'
}

export function onKeyboardShortcut(shortcut: KeyboardShortcut | Ref<KeyboardShortcut>, handler: KeyboardHandler, options: KeyboardShortcutOptions = {}) {
  useEventListener(options.event ?? 'keydown', (event) => {
    if (isMatchingShortcut(isRef(shortcut) ? shortcut.value : shortcut, event)) {
      handler(event)
    }
  })
}

/** Modifier combination names mapped to the flag the event carries. */
const modifiers = {
  ctrl: (event: KeyboardEvent) => event.ctrlKey,
  alt: (event: KeyboardEvent) => event.altKey,
  shift: (event: KeyboardEvent) => event.shiftKey,
  meta: (event: KeyboardEvent) => event.metaKey,
}

function isMatchingShortcut(shortcut: KeyboardShortcut, event: KeyboardEvent): boolean {
  for (const combination of shortcut) {
    if (isMatchingCombination(combination.toLowerCase(), event)) {
      return true
    }
  }
  return false
}

/**
 * Matches a combination against the event that is being handled.
 *
 * Everything is read off the event itself rather than from a set of currently
 * pressed keys kept up to date by global listeners: such a set is only as
 * accurate as the key events the page actually receives, and a missed (or
 * merely late) `keyup` leaves a key "pressed" forever — the next unrelated
 * keypress then fires the stale shortcut.
 */
function isMatchingCombination(combination: string, event: KeyboardEvent): boolean {
  const splitted = combination.split('+').map(key => key.trim())
  const targetKey = splitted.pop()
  for (const mod in modifiers) {
    if (splitted.includes(mod) !== modifiers[mod](event)) {
      return false
    }
  }
  return event.key.toLocaleLowerCase() === targetKey
}

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
