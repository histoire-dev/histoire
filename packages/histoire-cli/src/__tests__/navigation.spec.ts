import { describe, expect, it } from 'vitest'
import { normalizeKey } from '../terminal/keys.js'
import { createListNavigation } from '../terminal/navigation/list.js'
import { createSearchInput } from '../terminal/navigation/search.js'

const item = (id: string) => ({ id })
const key = (name: string, char?: string) => normalizeKey(char, { name })

describe('list navigation', () => {
  it('keeps the selection by ID across reordering and deletion', () => {
    const list = createListNavigation<{ id: string }>({ id: entry => entry.id })
    list.setItems(['a', 'b', 'c'].map(item))
    list.select('b')
    list.setItems(['c', 'a', 'b'].map(item))
    expect(list.selectedItem()).toEqual({ id: 'b' })
    // The item vanishes: the ID stays selected but is unresolved, and returns when it reappears.
    list.setItems(['c', 'a'].map(item))
    expect(list.selectedId()).toBe('b')
    expect(list.selectedItem()).toBeUndefined()
    list.setItems(['c', 'a', 'b'].map(item))
    expect(list.selectedItem()).toEqual({ id: 'b' })
  })

  it('pauses following when scrolling up and resumes on End', () => {
    const list = createListNavigation<{ id: string }>({ id: entry => entry.id, follow: true })
    list.setItems(['1', '2', '3'].map(item))
    expect(list.selectedId()).toBe('3')
    list.handleKey(key('up'), 5)
    expect(list.following()).toBe(false)
    list.setItems(['1', '2', '3', '4'].map(item))
    expect(list.selectedId()).toBe('2')
    list.handleKey(key('end'), 5)
    list.setItems(['1', '2', '3', '4', '5'].map(item))
    expect(list.selectedId()).toBe('5')
  })

  it('scrolls a window just far enough to show the cursor', () => {
    const list = createListNavigation<{ id: string }>({ id: entry => entry.id })
    list.setItems(Array.from({ length: 10 }, (_, index) => item(String(index))))
    list.handleKey(key('pagedown'), 4)
    const view = list.window(4)
    expect(view.items.map(entry => entry.id)).toEqual(['1', '2', '3', '4'])
    expect(view.items[view.selected].id).toBe('4')
  })
})

describe('search input', () => {
  it('consumes printable action keys while editing, applies on Enter and cancels on Escape', () => {
    const search = createSearchInput()
    expect(search.handleKey(key('r', 'r'))).toBe(false)
    expect(search.handleKey(key('/', '/'))).toBe(true)
    expect(search.active()).toBe(true)
    for (const char of 'qr') expect(search.handleKey(key(char, char))).toBe(true)
    expect(search.text()).toBe('qr')
    search.handleKey(key('return'))
    expect(search.applied()).toBe('qr')
    search.handleKey(key('/', '/'))
    search.handleKey(key('x', 'x'))
    search.handleKey(key('escape'))
    expect(search.active()).toBe(false)
    expect(search.applied()).toBe('qr')
  })
})
