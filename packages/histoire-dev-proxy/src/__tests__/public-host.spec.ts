import { request } from 'node:http'
import { expect, it } from 'vitest'
import { createProxyHttp } from '../server/http.js'
import { listen } from '../server/listener.js'

/** Read headers and close the status stream without waiting for it to end. */
function statusAt(url: URL, host: string) {
  return new Promise<{ code?: number, contentType?: string }>((resolve, reject) => {
    const operation = request(url, { headers: { host } }, (response) => {
      resolve({ code: response.statusCode, contentType: response.headers['content-type'] })
      response.destroy()
    })
    operation.on('error', reject).end()
  })
}

it('serves lifecycle events for the published hostname and blocks unrelated names', async () => {
  const proxy = createProxyHttp(
    () => ({ status: 'starting', generation: 'g', base: '/' }),
    async () => {},
    undefined,
    () => 'book.example',
  )
  try {
    const origin = await listen(proxy.server, 0, '127.0.0.1')
    const events = new URL('/__histoire/dev/events', origin)
    await expect(statusAt(events, `Book.Example:${events.port}`)).resolves.toEqual({ code: 200, contentType: 'text/event-stream' })
    await expect(statusAt(events, `other.book.example:${events.port}`)).resolves.toMatchObject({ code: 403 })
  }
  finally {
    await proxy.close()
  }
})
