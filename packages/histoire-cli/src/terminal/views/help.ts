import type { TerminalView, TerminalViewFactory } from './registry.js'
import { MAIN_ACTIONS } from '../actions.js'
import { createListNavigation } from '../navigation/list.js'
import { defaultStyle } from '../style.js'
import { renderViewFrame } from './frame.js'

/** Help screen: lists every main key and whether its view exists in this build. */
export const createHelpView: TerminalViewFactory = (host): TerminalView => {
  const navigation = createListNavigation<[string, string]>({ id: ([key, description]) => `${key}\u0000${description}` })
  /** Key column width: the longest key (`Esc or q`) plus a gap. */
  const KEY_WIDTH = 10
  /** Rows as `[key, description]`, rebuilt on each render so late-registered views appear. */
  function rows(): [string, string][] {
    const lines: [string, string][] = MAIN_ACTIONS.map(action => [action.key, action.description])
    for (const entry of host.shortcuts()) {
      if (entry.shortcut !== '?') lines.push([entry.shortcut, `${entry.title}${entry.available ? '' : ' (not available yet)'}`])
    }
    lines.push(['?', 'Show this help'], ['Ctrl+C', 'Quit from anywhere'], ['Esc or q', 'Leave a screen'])
    return lines
  }
  return {
    id: 'help',
    shortcut: '?',
    title: 'Help',
    handleKey: key => navigation.handleKey(key, Math.max(1, host.size().rows - 3)),
    render(size) {
      const style = defaultStyle()
      navigation.setItems(rows())
      const { items } = navigation.window(size.rows - 2)
      return renderViewFrame({ title: 'Histoire help', body: items.map(([key, description]) => `${style.key(key)}${' '.repeat(Math.max(2, KEY_WIDTH - key.length))}${description}`), style, footer: 'Up/Down scroll · Esc back', ...size })
    },
  }
}
