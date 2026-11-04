import type { ClipboardPlatform, ClipboardProcess } from '../terminal/clipboard.js'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { clipboardCommands, createClipboardWriter } from '../terminal/clipboard.js'

/** Scripted outcome of one command name. */
type Outcome = 'ok' | 'missing' | { exit: number }

/** Platform double: records stdin per command and answers per scripted outcome (the only mock, at the process boundary). */
function createPlatform(outcomes: Record<string, Outcome>, extra: Partial<ClipboardPlatform> = {}) {
  const received: Record<string, string> = {}
  const platform: Partial<ClipboardPlatform> = {
    platform: 'linux',
    env: {},
    spawn(command): ClipboardProcess {
      const child = new EventEmitter() as unknown as ClipboardProcess & EventEmitter
      const outcome = outcomes[command] ?? 'missing'
      const chunks: string[] = []
      ;(child as { stdin: unknown }).stdin = { on: () => {}, end(data?: string) {
        chunks.push(String(data))
        received[command] = chunks.join('')
        setImmediate(() => {
          if (outcome === 'ok') child.emit('close', 0)
          else if (outcome === 'missing') child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
          else child.emit('close', outcome.exit)
        })
      } }
      return child
    },
    ...extra,
  }
  return { platform, received }
}

describe('system clipboard', () => {
  it('prefers wl-copy on Wayland, falls back to X11 tools, and passes the exact text', async () => {
    const { platform, received } = createPlatform({ xclip: 'ok' }, { env: { WAYLAND_DISPLAY: 'wayland-0' } })
    expect(clipboardCommands('linux', { WAYLAND_DISPLAY: 'wayland-0' })[0].command).toBe('wl-copy')
    expect(await createClipboardWriter(platform)('héllo\nworld')).toEqual({ ok: true })
    expect(received.xclip).toBe('héllo\nworld')
  })

  it('reports the first real failure when every tool is missing or failing, with no terminal fallback', async () => {
    const { platform } = createPlatform({ xclip: { exit: 1 } })
    expect(await createClipboardWriter(platform)('x')).toEqual({ ok: false, reason: 'xclip exited with 1' })
    const none = createPlatform({})
    expect(await createClipboardWriter(none.platform)('x')).toEqual({ ok: false, reason: 'no clipboard tool found' })
  })

  it('falls back to a terminal request when no tool works, and says its acceptance is unknown', async () => {
    const written: string[] = []
    const { platform } = createPlatform({}, { terminal: { write: (data: string) => void written.push(data) } as never })
    const result = await createClipboardWriter(platform)('copy me')
    expect(result.ok).toBe(true)
    expect(result.note).toContain('support varies')
    expect(written).toEqual([`\u001B]52;c;${Buffer.from('copy me').toString('base64')}\u0007`])
  })

  it('uses UTF-16 text for Windows clip', async () => {
    const { platform } = createPlatform({ clip: 'ok' }, { platform: 'win32' })
    expect(clipboardCommands('win32', {})[0].encode!('é')).toEqual(Buffer.from(String.fromCodePoint(0xFEFF).concat('é'), 'utf16le'))
    expect((await createClipboardWriter(platform)('é')).ok).toBe(true)
  })
})
