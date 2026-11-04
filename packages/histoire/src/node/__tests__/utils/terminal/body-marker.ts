import { once } from 'node:events'
import { createServer } from 'node:http'

/** HTTP endpoint a held test body reports to, so tests know exactly when (and how often) it ran. */
export interface BodyMarker {
  /** Address to hand to `addMcpTestBodyMarker`. */
  url: string
  /** Number of times the body reported in. */
  count: () => number
  /** Resolves on the next report. */
  next: () => Promise<void>
  /** Request URLs (path and query) in arrival order. */
  urls: () => string[]
  /** Keeps answering later reports only after `release()`, holding the reporting test body in the browser. */
  hold: () => void
  /** Answers every held report and stops holding. */
  release: () => void
  close: () => void
}

/** Starts the endpoint on an ephemeral loopback port. */
export async function startBodyMarker(): Promise<BodyMarker> {
  let count = 0
  let held = false
  const requests: string[] = []
  const answers: Array<() => void> = []
  const waiting = new Set<() => void>()
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    // A held report is counted at once but answered only on release.
    if (held) answers.push(() => response.end('entered'))
    else response.end('entered')
    requests.push(request.url ?? '')
    count++
    for (const done of waiting) done()
    waiting.clear()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/entered`,
    count: () => count,
    next: () => new Promise<void>(resolve => void waiting.add(resolve)),
    urls: () => [...requests],
    hold: () => void (held = true),
    release() {
      held = false
      for (const answer of answers.splice(0)) answer()
    },
    close: () => {
      server.closeAllConnections()
      server.close()
    },
  }
}
