import { describe, expect, it, vi } from 'vitest'
import { EVENT_SEND } from '../../../histoire-app/src/app/util/const.js'
import { cleanEventPayload } from '../../../histoire-app/src/app/util/event-payload.js'
import { installRuntimeEventScope, publishRuntimeEvent, resolveRuntimeEventTarget } from '../../../histoire-app/src/app/util/runtime-events.js'

describe('runtime event payload and actor', () => {
  it('cleans DOM events, nested nodes, cycles and primitive payloads once into JSON-safe data', () => {
    const button = document.createElement('button')
    let click: MouseEvent | undefined
    button.addEventListener('click', event => click = event)
    button.click()
    const nested: any = { click, button, count: 2n, callback: () => {} }
    nested.self = nested
    const value = cleanEventPayload(nested) as any
    expect(value).toMatchObject({ button: 'Node', count: '2', self: '[Circular]', click: { type: 'click', target: 'Node' } })
    expect(value.callback).toBeUndefined()
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
    expect(cleanEventPayload('hello')).toBe('hello')
    expect(cleanEventPayload(null)).toBe(null)
    const shared = { value: 3 }
    expect(cleanEventPayload({ first: shared, second: shared, list: [shared] })).toEqual({ first: { value: 3 }, second: { value: 3 }, list: [{ value: 3 }] })
  })

  it('captures non-selected grid actor for synchronous nested payload and never guesses ambiguous async actor', async () => {
    const host = document.createElement('div')
    for (const id of ['selected', 'other:variant']) {
      const cell = document.createElement('div')
      cell.setAttribute('data-histoire-runtime-content', '')
      cell.setAttribute('data-histoire-variant-id', id)
      cell.append(document.createElement('button'))
      host.append(cell)
    }
    document.body.append(host)
    const close = installRuntimeEventScope(() => 'a:b')
    let owner
    host.querySelectorAll('button')[1].addEventListener('click', () => owner = resolveRuntimeEventTarget({ nested: { count: 1 } }))
    host.querySelectorAll('button')[1].click()
    expect(owner).toEqual({ storyId: 'a:b', variantId: 'other:variant' })
    await Promise.resolve()
    expect(resolveRuntimeEventTarget({ count: 2 })).toBeUndefined()
    expect(resolveRuntimeEventTarget({}, { storyId: 'a:b', variantId: 'other:variant' })).toEqual(owner)
    close()
    host.remove()
    expect(resolveRuntimeEventTarget({})).toBeUndefined()
  })

  it('relays finite source search shortcut and removes listeners on document retirement', () => {
    const publish = vi.fn()
    const close = installRuntimeEventScope(() => 'story', publish)
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(publish).toHaveBeenCalledWith(true, 'search')
    expect(event.defaultPrevented).toBe(true)
    close()
    const retired = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(retired)
    expect(retired.defaultPrevented).toBe(false)
    expect(publish).toHaveBeenCalledOnce()
  })

  it('retires event publication only for owning document scope', () => {
    const predecessor = vi.fn()
    const current = vi.fn()
    const closePredecessor = installRuntimeEventScope(() => 'story', undefined, predecessor)
    const closeCurrent = installRuntimeEventScope(() => 'story', undefined, current)
    const message = { type: EVENT_SEND, event: { name: 'saved', argument: 1 } } as const
    closePredecessor()
    expect(publishRuntimeEvent(message)).toBe(true)
    expect(current).toHaveBeenCalledExactlyOnceWith(message)
    expect(predecessor).not.toHaveBeenCalled()
    closeCurrent()
    expect(publishRuntimeEvent(message)).toBe(false)
    expect(current).toHaveBeenCalledOnce()
  })
})
