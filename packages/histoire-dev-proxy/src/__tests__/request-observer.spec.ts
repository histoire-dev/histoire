import type { ServerResponse } from 'node:http'
import type { ProxyRequestEvent } from '../../dist/index.js'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { startDevProxy } from '../../dist/index.js'

// Boundary: real public proxy, forked runtime peer, real sockets. The peer holds
// responses on `/hold` so pending and aborted exchanges are deterministic.
// Defects: duplicate or missing completion, aborted exchange reported as
// completed once backend work finishes, secrets leaking into events, proxy-owned
// routes listed as traffic, forwarding changed by observation.

/** Starts a proxy over the fixture runtime, optionally holding startup on a gate. */
async function startProxy(options: { observer?: (event: ProxyRequestEvent) => void, gate?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-observer-'))
  let held = true
  const waiting: ServerResponse[] = []
  let gate: ReturnType<typeof createServer> | undefined
  const config: Record<string, unknown> = { value: 'observed' }
  if (options.gate) {
    // Holds runtime startup until released; later loads pass straight through.
    gate = createServer((_, response) => {
      if (held) waiting.push(response)
      else response.end('go')
    })
    await new Promise<void>(resolve => gate!.listen(0, '127.0.0.1', resolve))
    config.gate = `http://127.0.0.1:${(gate.address() as { port: number }).port}`
  }
  await writeFile(join(root, 'histoire.config.ts'), JSON.stringify(config))
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), shutdownTimeout: 2000, onRequest: options.observer })
  return { proxy, release: () => {
    held = false
    for (const response of waiting.splice(0)) response.end('go')
  }, close: async () => {
    await proxy.close()
    gate?.closeAllConnections()
    gate?.close()
  } }
}

it('returns the same responses with and without an observer, streaming the body untouched', async () => {
  const seen: ProxyRequestEvent[] = []
  const bare = await startProxy({})
  const observed = await startProxy({ observer: event => seen.push(event) })
  try {
    await Promise.all([bare.proxy.ready, observed.proxy.ready])
    const read = async (base: string) => {
      const response = await fetch(`${base}api?x=1`, { method: 'POST', body: 'payload' })
      return { status: response.status, type: response.headers.get('content-type'), body: await response.text() }
    }
    const [one, two] = await Promise.all([read(bare.proxy.url), read(observed.proxy.url)])
    // Fixture bodies carry a per-process PID; everything else must match.
    expect({ ...one, body: JSON.parse(one.body).value }).toEqual({ ...two, body: JSON.parse(two.body).value })
    // A streamed body reaches the client before the exchange ends: the observer did not buffer it.
    const controller = new AbortController()
    const streamed = await fetch(`${observed.proxy.url}stream`, { signal: controller.signal })
    const first = await streamed.body!.getReader().read()
    expect(new TextDecoder().decode(first.value)).toBe('first chunk')
    expect(seen.filter(event => event.phase === 'end' && event.pathname === '/stream')).toEqual([])
    controller.abort()
  }
  finally {
    await Promise.all([bare.close(), observed.close()])
  }
})

it('records one expected outcome per exchange, including startup responses and client aborts', async () => {
  const events: ProxyRequestEvent[] = []
  const rig = await startProxy({ observer: event => events.push(event), gate: true })
  const ends = () => events.filter((event): event is Extract<ProxyRequestEvent, { phase: 'end' }> => event.phase === 'end')
  try {
    // Startup: answered by the proxy while the runtime config is held.
    const startup = await fetch(`${rig.proxy.url}deep`, { headers: { accept: 'text/html' } })
    expect(startup.status).toBe(200)
    await startup.text()
    await expect.poll(() => ends().map(event => [event.pathname, event.status, event.outcome])).toEqual([['/deep', 200, 'completed']])
    await expect.poll(() => rig.proxy.status).toBe('starting')
    rig.release()
    await rig.proxy.ready

    // Backend failure: the peer destroys the socket, the proxy answers 503.
    const boom = await fetch(`${rig.proxy.url}boom`)
    expect(boom.status).toBe(503)
    await boom.text()
    await expect.poll(() => ends().at(-1)).toMatchObject({ pathname: '/boom', status: 503, outcome: 'failed' })

    // Held exchange: started, not ended. Client aborts, backend finishes later: still exactly one aborted record.
    const controller = new AbortController()
    const held = fetch(`${rig.proxy.url}hold`, { signal: controller.signal }).catch(() => {})
    await expect.poll(() => events.some(event => event.phase === 'start' && event.pathname === '/hold')).toBe(true)
    expect(ends().some(event => event.pathname === '/hold')).toBe(false)
    controller.abort()
    await held
    await expect.poll(() => ends().filter(event => event.pathname === '/hold').map(event => event.outcome)).toEqual(['aborted'])
    await (await fetch(`${rig.proxy.url}release`)).text()
    await expect.poll(() => ends().at(-1)?.pathname).toBe('/release')
    expect(ends().filter(event => event.pathname === '/hold')).toHaveLength(1)

    // Every start was matched by exactly one end.
    expect(events.filter(event => event.phase === 'start')).toHaveLength(ends().length)
    expect(new Set(ends().map(event => event.key)).size).toBe(ends().length)
  }
  finally {
    await rig.close()
  }
})

it('keeps queries, headers and bodies out of events and skips proxy-owned routes', async () => {
  const events: ProxyRequestEvent[] = []
  const rig = await startProxy({ observer: event => events.push(event) })
  try {
    await rig.proxy.ready
    await (await fetch(`${rig.proxy.url}assets/app.js?token=QUERY-SECRET#frag`, { headers: { authorization: 'Bearer HEADER-SECRET', cookie: 'sid=COOKIE-SECRET' } })).text()
    await (await fetch(`${rig.proxy.url}echo`, { method: 'POST', body: 'BODY-SECRET' })).text()
    // Proxy-owned: loading assets and the status stream.
    await (await fetch(`${rig.proxy.url}__histoire/dev/lifecycle.js`)).text()
    const stream = new AbortController()
    const sse = await fetch(`${rig.proxy.url}__histoire/dev/events`, { signal: stream.signal })
    await sse.body!.getReader().read()
    stream.abort()
    await (await fetch(`${rig.proxy.url}last`)).text()
    await expect.poll(() => events.some(event => event.phase === 'end' && event.pathname === '/last')).toBe(true)

    const text = JSON.stringify(events)
    for (const secret of ['QUERY-SECRET', 'HEADER-SECRET', 'COOKIE-SECRET', 'BODY-SECRET', 'frag']) expect(text).not.toContain(secret)
    expect(events.filter(event => event.phase === 'end').map(event => event.pathname)).toEqual(['/assets/app.js', '/echo', '/last'])
  }
  finally {
    await rig.close()
  }
})

it('survives an observer that throws', async () => {
  let calls = 0
  const rig = await startProxy({ observer: () => {
    calls++
    throw new Error('observer failure')
  } })
  try {
    await rig.proxy.ready
    for (let index = 0; index < 2; index++) expect((await fetch(rig.proxy.url)).status).toBe(200)
    expect(calls).toBe(4)
  }
  finally {
    await rig.close()
  }
})
