import type { Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { isRef, ref } from 'vue'
import { isMac } from './env.js'

export type KeyboardShortcut = string[]

export type KeyboardHandler = (event: KeyboardEvent) => unknown

export interface KeyboardShortcutOptions {
  event?: 'keyup' | 'keydown' | 'keypress'
}

const modifiers: { [i: string]: { key: string, pressed: boolean } } = {
  ctrl: { key: 'Control', pressed: false },
  alt: { key: 'Alt', pressed: false },
  shift: { key: 'Shift', pressed: false },
  meta: { key: 'Meta', pressed: false },
}

const pressedKeys = new Set<string>()

const trackedWindows = ref<Window[]>([])

function bindTracking(target: Window) {
  const onKeydown = (event: KeyboardEvent) => {
    for (const i in modifiers) {
      const mod = modifiers[i]
      if (mod.key === event.key) {
        mod.pressed = true
        return
      }
    }
    pressedKeys.add(event.key.toLocaleLowerCase())
  }
  const onKeyup = (event: KeyboardEvent) => {
    requestAnimationFrame(() => {
      pressedKeys.clear()
      for (const i in modifiers) {
        const mod = modifiers[i]
        if (mod.key === event.key) {
          mod.pressed = false
          break
        }
      }
    })
  }
  const onBlur = () => {
    pressedKeys.clear()
    for (const i in modifiers) {
      modifiers[i].pressed = false
    }
  }
  target.addEventListener('keydown', onKeydown)
  target.addEventListener('keyup', onKeyup)
  target.addEventListener('blur', onBlur)
  return () => {
    target.removeEventListener('keydown', onKeydown)
    target.removeEventListener('keyup', onKeyup)
    target.removeEventListener('blur', onBlur)
  }
}

// Forward shortcuts from sandbox iframes. Closes #350.
export function trackWindow(target: Window): () => void {
  if (trackedWindows.value.includes(target)) return () => {}
  const cleanup = bindTracking(target)
  trackedWindows.value = [...trackedWindows.value, target]
  return () => {
    cleanup()
    trackedWindows.value = trackedWindows.value.filter(w => w !== target)
  }
}

trackWindow(window)

export function onKeyboardShortcut(shortcut: KeyboardShortcut | Ref<KeyboardShortcut>, handler: KeyboardHandler, options: KeyboardShortcutOptions = {}) {
  useEventListener(trackedWindows, options.event ?? 'keydown', (event: KeyboardEvent) => {
    // Sync modifier state from the event so a blur-clear (e.g. focusing an
    // iframe while holding a modifier) doesn't drop the shortcut.
    modifiers.ctrl.pressed = event.ctrlKey
    modifiers.alt.pressed = event.altKey
    modifiers.shift.pressed = event.shiftKey
    modifiers.meta.pressed = event.metaKey
    if (isMatchingShortcut(isRef(shortcut) ? shortcut.value : shortcut)) {
      handler(event)
    }
  })
}

function isMatchingShortcut(shortcut: KeyboardShortcut): boolean {
  for (const combination of shortcut) {
    if (isMatchingCombination(combination.toLowerCase())) {
      return true
    }
  }
  return false
}

function isMatchingCombination(combination: string): boolean {
  const splitted = combination.split('+').map(key => key.trim())
  const targetKey = splitted.pop()
  for (const mod in modifiers) {
    const containsMod = splitted.includes(mod)
    const isPressed = modifiers[mod].pressed
    if (containsMod !== isPressed) {
      return false
    }
  }
  return pressedKeys.has(targetKey)
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
