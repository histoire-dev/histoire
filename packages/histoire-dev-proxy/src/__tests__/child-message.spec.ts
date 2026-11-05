import { expect, it } from 'vitest'
import { isChildMessage } from '../protocol.js'

/** A `ready` frame with the given workbench base. */
const ready = (base: unknown) => ({ type: 'ready', generation: 'g', target: 'http://127.0.0.1:1234', base })

it('accepts same-origin absolute bases', () => {
  expect(isChildMessage(ready('/'))).toBe(true)
  expect(isChildMessage(ready('/histoire/'))).toBe(true)
})

it.each(['//evil.com/x', '/\\evil.com/x', 'relative', '/a\\b'])('rejects ready base %s', (base) => {
  expect(isChildMessage(ready(base))).toBe(false)
})

it('accepts bounded runtime restart requests only', () => {
  expect(isChildMessage({ type: 'restart', generation: 'g', source: 'Installed plugin' })).toBe(true)
  expect(isChildMessage({ type: 'restart', generation: 'g', source: 'Installed plugin', fresh: true })).toBe(true)
  expect(isChildMessage({ type: 'restart', generation: 'g', source: '' })).toBe(false)
  expect(isChildMessage({ type: 'restart', generation: 'g', source: 'x'.repeat(201) })).toBe(false)
  expect(isChildMessage({ type: 'restart', generation: 'g', source: 'ok', fresh: 'yes' })).toBe(false)
})
