import { expect, it } from 'vitest'
import { createVitestBrowserResolvePlugin } from '../vitest-browser-config.js'

it('creates the browser resolve plugin when optional testing-library packages are missing', () => {
  expect(() => createVitestBrowserResolvePlugin()).not.toThrow()
})
