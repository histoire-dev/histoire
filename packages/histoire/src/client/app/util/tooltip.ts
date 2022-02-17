import { isMac } from './env.js'
import { formatKey } from './keyboard.js'

export function makeTooltip (descriptionHtml: string, keyboardShortcut: ({ isMac: boolean }) => string) {
  return {
    content: `<div>${descriptionHtml}</div><div class="htw-flex htw-items-center htw-gap-1 htw-mt-2 htw-text-sm">${genKeyboardShortcutHtml(keyboardShortcut({ isMac }))}</div>`,
    html: true,
  }
}

function genKeyboardShortcutHtml (shortcut: string) {
  return shortcut.split('+').map(k => k.trim()).map(key => `<span class="htw-bg-gray-500 htw-border-b-2 htw-border-gray-600 htw-px-1 htw-rounded-sm">${formatKey(key)}</span>`).join('')
}
