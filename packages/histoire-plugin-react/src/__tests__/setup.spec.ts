import type { ReactStorySetupApi } from '../helpers.js'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { callSetupFunctions } from '../util/setup.js'

/** Capture global setup ordering without involving unrelated adapter state. */
const hooks = vi.hoisted(() => ({ generated: vi.fn(), user: vi.fn() }))
vi.mock('virtual:$histoire-generated-global-setup', () => ({ setupReact: hooks.generated }))
vi.mock('virtual:$histoire-setup', () => ({ setupReact: hooks.user }))

it('runs generated, user, and variant setup in order with same root payload', async () => {
  const order: string[] = []
  hooks.generated.mockImplementation(() => {
    order.push('generated')
  })
  hooks.user.mockImplementation(() => {
    order.push('user')
  })
  const variant = {
    id: 'variant',
    title: 'Variant',
    state: {},
    setupApp: vi.fn(() => {
      order.push('variant')
    }),
  }
  const target = document.createElement('div')
  const api: ReactStorySetupApi = {
    app: createRoot(target),
    story: { id: 'story', title: 'Story', variants: [variant] },
    variant,
    addWrapper: vi.fn(),
  }
  try {
    await callSetupFunctions(api, target)
    expect(order).toEqual(['generated', 'user', 'variant'])
    expect(hooks.generated).toHaveBeenCalledWith(api)
    expect(hooks.user).toHaveBeenCalledWith(api)
    expect(variant.setupApp).toHaveBeenCalledWith(api)
  }
  finally { api.app.unmount() }
})
