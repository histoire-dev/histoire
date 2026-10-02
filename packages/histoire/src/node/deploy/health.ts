import type { ServerResponse } from 'node:http'

/** Small operational response contains no paths, credentials or catalog content. */
export function serveNodeHealth(response: ServerResponse, ready: boolean, buildId: string, readiness: boolean): void {
  response.writeHead(readiness && !ready ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ status: ready ? 'ready' : 'draining', buildId }))
}
