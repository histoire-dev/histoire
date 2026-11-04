import type { TerminalViewHost } from '../views/registry.js'
import { createDiagnosticsClient } from './client.js'
import { buildDiagnosticsLines } from './lines.js'

/** Shortest time between refreshes triggered by showing the block. */
const REFRESH_INTERVAL_MS = 2000

/**
 * Contributes runtime diagnostics to the session info screen and a compact count to the main
 * panel. Runs once per session (called by the requests view factory). Data is read from the
 * current generation after each startup phase, and while the block is displayed at most every
 * two seconds, so changes after startup (story edits, MCP clients) appear without a restart.
 * @param host View host.
 */
export function attachDiagnostics(host: TerminalViewHost) {
  const client = createDiagnosticsClient(host.bridge, host.progress, () => host.requestRender())
  let lastKey = ''
  let lastRefresh = 0
  let reading = false

  /** Reads now unless a read is running. */
  function refresh() {
    if (reading) return
    reading = true
    lastRefresh = Date.now()
    void client.refresh().finally(() => (reading = false))
  }

  // Startup phases finishing (collection, revalidation) change what the runtime reports.
  host.progress.subscribe((snapshot) => {
    const key = `${snapshot.generation}:${snapshot.status}:${snapshot.phases.filter(phase => phase.status === 'completed').length}`
    if (key === lastKey) return
    lastKey = key
    if (snapshot.status === 'ready') refresh()
  })

  host.addInfoSection(() => {
    if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) refresh()
    const { value, problem } = client.current()
    return { title: 'Diagnostics', lines: buildDiagnosticsLines({ diagnostics: value, problem, requests: host.requests }) }
  })

  host.addPanelSegment(() => {
    const issues = client.current().value?.collection?.issues ?? 0
    const failed = host.requests.entries().filter(entry => entry.outcome === 'failed').length
    const parts = [...(issues ? [`${issues} ${issues === 1 ? 'issue' : 'issues'}`] : []), ...(failed ? [`${failed} failed ${failed === 1 ? 'request' : 'requests'}`] : [])]
    return parts.length ? parts.join(' · ') : undefined
  })
}
