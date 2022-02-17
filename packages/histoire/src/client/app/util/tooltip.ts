import { isMac } from './env.js'
import { formatKey } from './keyboard.js'

export function makeTooltip (descriptionHtml: string, keyboardShortcut: ({ isMac: boolean }) => string) {
  return {
    content: `${descriptionHtml}<br><div class="htw-flex htw-items-center htw-gap-1 htw-mt-1">${genKeyboardShortcutHtml(keyboardShortcut({ isMac }))}</div>`,
    html: true,
  }
}

function genKeyboardShortcutHtml (shortcut: string) {
  return shortcut.split('+').map(k => k.trim()).map(key => `<span class="htw-bg-gray-700 htw-px-1 htw-rounded-sm">${formatKey(key)}</span>`).join('')
}
