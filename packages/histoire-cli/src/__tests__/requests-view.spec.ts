import type { ProxyRequestEvent } from '@histoire/dev-proxy'
import { describe, expect, it } from 'vitest'
import { createRequestHistory } from '../terminal/requests/history.js'
import { createRequestsView } from '../terminal/views/requests.js'
import { settleTimers } from './utils/flush.js'
import { createViewHostRig } from './utils/terminal/view-host.js'

/** Start and end events of one exchange. */
function exchange(key: number, pathname: string, outcome: 'completed' | 'failed' | 'aborted' = 'completed', status: number | null = 200): ProxyRequestEvent[] {
  return [
    { phase: 'start', key, method: 'GET', pathname },
    { phase: 'end', key, method: 'GET', pathname, ...(status === null ? {} : { status }), outcome, durationMs: 12 },
  ]
}

describe('request history', () => {
  it('retains 500 exchanges, reports omission and keeps IDs increasing across deletion', () => {
    const history = createRequestHistory()
    for (let key = 1; key <= 505; key++) exchange(key, `/asset-${key}.js`).forEach(history.onEvent)
    expect(history.entries()).toHaveLength(500)
    expect(history.entries()[0].pathname).toBe('/asset-6.js')
    expect(history.omitted).toBe(5)
    history.clear()
    exchange(506, '/next').forEach(history.onEvent)
    expect(history.entries().map(record => record.id)).toEqual([506])
  })

  it('bounds in-flight tracking, yet still records an exchange whose tracking was dropped', () => {
    const history = createRequestHistory({ inFlight: 2 })
    for (let key = 1; key <= 4; key++) history.onEvent({ phase: 'start', key, method: 'GET', pathname: `/hold-${key}` })
    expect(history.inFlight()).toBe(2)
    history.onEvent({ phase: 'end', key: 1, method: 'GET', pathname: '/hold-1', outcome: 'aborted', durationMs: 5000 })
    expect(history.entries().map(record => [record.pathname, record.outcome])).toEqual([['/hold-1', 'aborted']])
    expect(history.inFlight()).toBe(2)
  })

  it('redacts the credential and drops terminal controls from retained paths', () => {
    const history = createRequestHistory({ secrets: ['s3cret-token'] })
    exchange(1, '/p/s3cret-token/\u001B[31mred\u001B[0m').forEach(history.onEvent)
    expect(history.entries()[0].pathname).toBe('/p/[credential]/red')
  })
})

describe('requests view', () => {
  it('lists real outcomes, filters, copies one clean line and is deleted by x', async () => {
    const rig = createViewHostRig({ rows: 14 })
    const view = rig.open(createRequestsView)
    ;[...exchange(1, '/index.html'), ...exchange(2, '/api/boom', 'failed', 503), ...exchange(3, '/stream', 'aborted', null)].forEach(rig.host.requests.onEvent)
    rig.host.requests.onEvent({ phase: 'start', key: 4, method: 'GET', pathname: '/pending' })
    let text = view.screen().join('\n')
    expect(text).toContain('GET /index.html  200  completed')
    expect(text).toContain('GET /api/boom  503  failed')
    expect(text).toContain('GET /stream  no response  aborted')
    expect(text).toContain('1 in flight')
    expect(text).not.toContain('/pending')

    view.keys('/', 'b', 'o', 'o', 'm', 'return')
    text = view.screen().join('\n')
    expect(text).toContain('/api/boom')
    expect(text).not.toContain('/index.html')

    view.keys('y')
    await settleTimers()
    expect(rig.copied).toEqual(['GET /api/boom  503  failed  12ms'])

    expect(rig.retained.clear().summary).toContain('3 requests')
    expect(rig.host.requests.entries()).toEqual([])
  })
})
