import { describe, expect, it } from 'vitest'
import { createKeyInput } from '../terminal/keys.js'
import { createPlainInput, runPlainCommand } from '../terminal/plain.js'
import { settleTimers } from './utils/flush.js'
import { createFakeTerminal } from './utils/terminal/streams.js'

describe('key input ownership', () => {
  it('decodes keys, restores raw mode and flow state, and removes only its listener', async () => {
    const { stdin } = createFakeTerminal()
    const foreign = () => {}
    stdin.on('keypress', foreign)
    stdin.setRawMode(true)
    const keys: string[] = []
    const input = createKeyInput({ stdin, onKey: key => keys.push(`${key.ctrl ? '^' : ''}${key.char ?? key.name}`) })
    input.attach()
    stdin.write('rR/\u001B[A\u001B[6~\u0003')
    await settleTimers(20)
    expect(keys).toEqual(['r', 'R', '/', 'up', 'pagedown', '^c'])
    input.detach()
    // The previous owner's raw state and listener survive release.
    expect(stdin.isRaw).toBe(true)
    expect(stdin.listeners('keypress')).toEqual([foreign])
  })

  it('does not stack listeners over repeated attach cycles and lets a pristine stream rest', () => {
    const { stdin } = createFakeTerminal()
    const input = createKeyInput({ stdin, onKey: () => {} })
    for (let cycle = 0; cycle < 5; cycle++) {
      input.attach()
      input.attach()
      expect(stdin.listenerCount('keypress')).toBe(1)
      expect(stdin.isRaw).toBe(true)
      input.detach()
      expect(stdin.listenerCount('keypress')).toBe(0)
      expect(stdin.isRaw).toBe(false)
      expect(stdin.isPaused()).toBe(true)
    }
  })
})

describe('plain line input', () => {
  it('delivers newline-terminated commands and stops reading on detach', async () => {
    const { stdin } = createFakeTerminal()
    const lines: string[] = []
    const input = createPlainInput({ stdin, onLine: line => lines.push(line) })
    input.attach()
    stdin.write('restart fresh\nhel')
    stdin.write('p\n')
    await settleTimers(20)
    expect(lines).toEqual(['restart fresh', 'help'])
    input.detach()
    stdin.write('quit\n')
    await settleTimers(20)
    expect(lines).toHaveLength(2)
    expect(stdin.listenerCount('data')).toBe(0)
  })

  it('maps commands to actions and answers unknown or unavailable ones plainly', async () => {
    const calls: string[] = []
    const host = {
      restart: async (request: { fresh: boolean }) => void calls.push(request.fresh ? 'restart-fresh' : 'restart'),
      openBrowser: async () => void calls.push('open'),
      url: () => 'http://localhost:6006/',
      copy: async () => ({ ok: true }),
      clearScreen: () => {},
      quit: () => void calls.push('quit'),
      report: (text: string) => void calls.push(text),
    }
    for (const line of ['restart', ' Restart   Fresh ', 'open', 'watch', 'nope', '', 'quit']) await runPlainCommand(host, line)
    expect(calls).toEqual([
      'Restart requested',
      'restart',
      'Fresh restart requested',
      'restart-fresh',
      'Opening workbench',
      'open',
      '"watch" is not available yet',
      expect.stringContaining('Unknown command "nope"'),
      'quit',
    ])
  })
})
