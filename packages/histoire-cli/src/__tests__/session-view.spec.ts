import type { SessionInfoDto } from '../terminal/protocol/session.js'
import { describe, expect, it } from 'vitest'
import { renderQrRows } from '../terminal/info/qr.js'
import { createSessionView } from '../terminal/views/session.js'
import { settleTimers } from './utils/flush.js'
import { readyGeneration } from './utils/terminal/progress.js'
import { createScriptedBridge, createViewHostRig, stripSgr } from './utils/terminal/view-host.js'

const info = (histoire: string): SessionInfoDto => ({ histoire, node: 'v22.12.0', vite: '7.1.0', root: '/work/project', configFile: '/work/project/histoire.config.ts', collection: { stories: 3, variants: 7, outcome: 'success', diagnostics: 0 }, mcp: { enabled: true, url: 'http://127.0.0.1:7777/mcp', tokenRequired: true } })

/** Bridge reply that fails. */
function failing(): never {
  throw new Error('timed out')
}

describe('session info view', () => {
  it('shows runtime facts, addresses and summaries, then drops them when the generation is replaced', async () => {
    let version = '1.0.0'
    const rig = createViewHostRig({ bridge: createScriptedBridge(() => info(version)), networkUrls: ['http://192.168.1.20:6007/'], rows: 30, url: 'http://localhost:6007/__histoire/' })
    readyGeneration(rig.progress, 'g1')
    const session = rig.open(createSessionView)
    await settleTimers()
    let text = session.screen().join('\n')
    for (const expected of ['1.0.0', 'v22.12.0', '7.1.0', '/work/project', 'histoire.config.ts', '3 stories · 7 variants', 'http://127.0.0.1:7777/mcp (bearer token required)', 'http://localhost:6007/__histoire/', 'http://192.168.1.20:6007/__histoire/', 'Initial start']) expect(text).toContain(expected)

    // Restart: the new generation has not answered yet, so no stale version is current.
    rig.progress.onRestart({ kind: 'config', source: 'Histoire: histoire.config.ts', fresh: false })
    rig.progress.onStatus({ status: 'restarting' })
    text = session.screen().join('\n')
    expect(text).not.toContain('1.0.0')
    expect(text).toContain('Waiting for the runtime')
    version = '1.0.1'
    rig.progress.onRuntimeStart({ generation: 'g2', fresh: false })
    rig.progress.onStatus({ status: 'ready' })
    await settleTimers()
    text = session.screen().join('\n')
    expect(text).toContain('1.0.1')
    expect(text).toContain('histoire.config.ts')
    expect(text).toContain('Config changed')
  })

  it('says plainly when the runtime cannot answer, and lists no network address for a loopback listener', async () => {
    const rig = createViewHostRig({ rows: 30, bridge: createScriptedBridge(failing) })
    readyGeneration(rig.progress, 'g1')
    const session = rig.open(createSessionView)
    await settleTimers()
    const text = session.screen().join('\n')
    expect(text).toContain('Runtime details unavailable: timed out')
    expect(text).toContain('Network   none available')
  })

  it('copies the selected address and keeps it visible when the clipboard fails', async () => {
    const rig = createViewHostRig({ copy: async () => ({ ok: false, reason: 'no clipboard tool found' }), networkUrls: ['http://10.0.0.7:6006/'] })
    readyGeneration(rig.progress, 'g1')
    const session = rig.open(createSessionView)
    session.keys('down', 'y')
    await settleTimers()
    expect(rig.notices.at(-1)).toBe('Copy unavailable: no clipboard tool found. Address is still shown')
    expect(session.screen().join('\n')).toContain('http://10.0.0.7:6006/')
  })

  it('shows a QR code for the selected address, follows the selection, and refuses to clip it', async () => {
    const local = 'http://localhost:6007/__histoire/'
    const network = 'http://192.168.1.20:6007/__histoire/'
    const strip = (rows: string[]) => rows.map(stripSgr)
    const rig = createViewHostRig({ networkUrls: ['http://192.168.1.20:6007/'], rows: 40, columns: 80, url: local })
    const session = rig.open(createSessionView)
    session.keys('down', 'r')
    await settleTimers()
    const networkCode = strip(await renderQrRows(network))
    let text = session.screen().join('\n')
    for (const row of networkCode) expect(text).toContain(row)

    // The repaint after a selection change starts the next code.
    session.keys('up')
    session.screen()
    await settleTimers()
    text = session.screen().join('\n')
    for (const row of strip(await renderQrRows(local))) expect(text).toContain(row)
    expect(text).not.toContain(networkCode[3])

    session.keys('r')
    expect(session.screen().join('\n')).not.toContain(networkCode[3])

    const small = createViewHostRig({ rows: 12, columns: 80, url: local })
    const smallSession = small.open(createSessionView)
    smallSession.keys('r')
    await settleTimers()
    expect(smallSession.screen().join('\n')).toContain('Terminal too small for the QR code')
  })

  it('lists an explicit --host address once, so the network row stays reachable', async () => {
    const rig = createViewHostRig({ url: 'http://192.168.1.5:6006/', networkUrls: ['http://192.168.1.5:6006/', 'http://10.0.0.7:6006/'] })
    const session = rig.open(createSessionView)
    expect(session.screen().filter(line => line.includes('http://192.168.1.5:6006/'))).toHaveLength(1)
    session.keys('down', 'y')
    await settleTimers()
    expect(rig.copied).toEqual(['http://10.0.0.7:6006/'])
  })

  it('keeps the selected row when the workbench address changes', async () => {
    const rig = createViewHostRig({ url: 'http://localhost:6007/', networkUrls: ['http://192.168.1.20:6007/'], rows: 40 })
    const session = rig.open(createSessionView)
    session.keys('down')
    session.screen()
    // Ready: the public URL becomes the workbench URL under the base, on other interfaces.
    rig.setUrl('http://localhost:6007/docs/')
    session.keys('y')
    await settleTimers()
    expect(rig.copied).toEqual(['http://192.168.1.20:6007/docs/'])
    session.keys('r')
    await settleTimers()
    for (const row of (await renderQrRows('http://192.168.1.20:6007/docs/')).map(stripSgr)) expect(session.screen().join('\n')).toContain(row)
  })

  it('renders blocks contributed through addInfoSection', () => {
    const rig = createViewHostRig()
    rig.host.addInfoSection(() => ({ title: 'Diagnostics', lines: ['3 requests'] }))
    expect(rig.open(createSessionView).screen().join('\n')).toMatch(/Diagnostics\n\s+3 requests/)
  })
})
