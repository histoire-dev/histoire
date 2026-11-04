import type { TerminalViewFactory } from './registry.js'
import { createSessionInfoClient } from '../info/client.js'
import { buildSessionLines } from '../info/lines.js'
import { renderQrRows } from '../info/qr.js'
import { createListNavigation } from '../navigation/list.js'
import { displayWidth } from '../width.js'
import { renderViewFrame } from './frame.js'

/** Address row: label shown before the URL. */
interface UrlRow {
  /** Stable row key (`local`, `network:0`, ...) that survives address changes. */
  id: string
  url: string
  label: string
}

/**
 * `i`: versions, project, actual bound addresses, uptime, phase durations, restart reason and
 * collection/MCP summary. Runtime facts come from `session.get` of the current generation;
 * addresses and lifecycle come from live parent state. Other slices add blocks with
 * `host.addInfoSection`. Up/Down select an address, `y` copies it, `o` opens it, `r` toggles
 * its QR code.
 */
export const createSessionView: TerminalViewFactory = (host) => {
  const client = createSessionInfoClient(host.bridge, host.progress, () => host.requestRender())
  const navigation = createListNavigation<UrlRow>({ id: row => row.id })
  const startedAt = Date.now()
  let unsubscribe: (() => void) | undefined
  let lastGeneration: string | undefined
  /** Rendered QR rows per address: a pending render, its rows, or why it failed. */
  const qrCodes = new Map<string, Promise<void> | string[] | Error>()
  let qrShown = false

  /** Local address first, then every reachable network address with the workbench path. */
  function urlRows(): UrlRow[] {
    const local = host.url()
    if (!local) return []
    const path = new URL(local).pathname
    // An explicit `--host <ip>` makes the local address equal to the network one: list it once.
    const network = host.networkUrls().map(base => new URL(path, base).href).filter(url => url !== local)
    return [{ id: 'local', url: local, label: 'Local' }, ...network.map((url, index) => ({ id: `network:${index}`, url, label: 'Network' }))]
  }

  /** QR rows for an address once rendered; the first request starts the render and repaints when done. */
  function qrFor(url: string): string[] | Error | undefined {
    const cached = qrCodes.get(url)
    if (cached === undefined) {
      const pending = renderQrRows(url).then(
        rows => void qrCodes.set(url, rows),
        error => void qrCodes.set(url, error instanceof Error ? error : new Error(String(error))),
      ).finally(() => host.requestRender())
      qrCodes.set(url, pending)
      return undefined
    }
    return cached instanceof Promise ? undefined : cached
  }

  /**
   * QR block for the selected address. A code that does not fit is replaced by a notice:
   * a clipped code cannot be scanned.
   * @param url Selected address.
   * @param room Body rows and columns left below the address list.
   * @param room.rows Free body rows.
   * @param room.columns Screen width.
   */
  function qrLines(url: string | undefined, room: { rows: number, columns: number }): string[] {
    if (!qrShown || !url) return []
    const code = qrFor(url)
    if (!code) return []
    if (code instanceof Error) return ['', `  QR code unavailable: ${code.message}`]
    // Body rows carry a one-column indent on top of the block's own two.
    if (code.length + 1 > room.rows || displayWidth(code[0] ?? '') + 3 > room.columns) return ['', '  Terminal too small for the QR code']
    return ['', ...code.map(row => `  ${row}`)]
  }

  /** Refreshes runtime facts when the generation or its readiness changed. */
  function onProgress() {
    const { generation, status } = host.progress.snapshot()
    const key = `${generation}:${status}`
    if (key !== lastGeneration) {
      lastGeneration = key
      void client.refresh()
    }
    host.requestRender()
  }

  return {
    id: 'session',
    shortcut: 'i',
    title: 'Session info',
    enter() {
      lastGeneration = undefined
      unsubscribe = host.progress.subscribe(onProgress)
      onProgress()
    },
    leave() {
      unsubscribe?.()
      unsubscribe = undefined
    },
    handleKey(key) {
      const rows = urlRows()
      navigation.setItems(rows)
      if (navigation.handleKey(key, 1)) return true
      const selected = navigation.selectedItem()
      if (key.char === 'y' && selected) {
        void host.copy(selected.url).then(result => host.notify(result.ok ? `Copied ${selected.label.toLowerCase()} address${result.note ? ` (${result.note})` : ''}` : `Copy unavailable: ${result.reason}. Address is still shown`))
      }
      else if (key.char === 'o' && selected) {
        host.notify('Opening workbench')
        void host.openBrowser(selected.url).catch(error => host.notify(`Failed: ${error instanceof Error ? error.message : String(error)}`))
      }
      else if (key.char === 'r') {
        qrShown = !qrShown
        if (qrShown && selected) qrFor(selected.url)
      }
      else if (key.char === 'u') {
        void client.refresh()
      }
      else {
        return false
      }
      return true
    },
    render(size) {
      const rows = urlRows()
      navigation.setItems(rows)
      const { info, problem } = client.current()
      const selectedId = navigation.selectedId()
      const addresses = rows.length
        ? rows.map(row => `${row.id === selectedId ? '›' : ' '} ${row.label.padEnd(9)} ${row.url}`)
        : ['  Address  not known yet']
      if (!host.networkUrls().length) addresses.push('  Network   none available')
      const lines = [
        ...addresses,
        ...qrLines(navigation.selectedItem()?.url, { rows: size.rows - 2 - addresses.length, columns: size.columns }),
        '',
        ...buildSessionLines({ snapshot: host.progress.snapshot(), info, infoProblem: problem, uptimeMs: Date.now() - startedAt }),
        ...host.infoSections().flatMap(section => ['', `\u001B[1m${section.title}\u001B[22m`, ...section.lines.map(line => `  ${line}`)]),
      ]
      return renderViewFrame({ title: 'Session info', body: lines.map(line => ` ${line}`), footer: 'Up/Down address · y copy · o open · r QR code · u refresh · Esc back', ...size })
    },
  }
}
