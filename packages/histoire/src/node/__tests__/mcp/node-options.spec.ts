import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeNodeBase } from '../../deploy/base.js'
import { resolveNodeBrowserPolicy, resolveNodeOptions } from '../../deploy/options.js'

describe('deployed options', () => {
  it('rejects noncanonical bases while supporting encoded spaces and Unicode', () => {
    for (const base of ['/book space/', '/雪/', '/book%2520space/', '/bad%/', '/book/?token=x', '/book/../private/', '/book/%2e%2e/private/']) expect(() => normalizeNodeBase(base)).toThrow('canonical URL path')
    for (const base of ['/book%20space/', '/%E9%9B%AA/']) expect(normalizeNodeBase(base)).toBe(base)
  })
  it('requires public origin for default remote bind and token for enabled MCP', () => {
    expect(() => resolveNodeOptions(true, {}, [])).toThrow('PUBLIC_ORIGIN')
    expect(() => resolveNodeOptions(true, { PUBLIC_ORIGIN: 'https://book.example' }, [])).toThrow('HISTOIRE_MCP_TOKEN')
    const environment = { PUBLIC_ORIGIN: 'https://book.example', HISTOIRE_MCP_TOKEN: 'ab'.repeat(32) }
    expect(resolveNodeOptions(true, environment, []).mcpEnabled).toBe(true)
    expect(environment).not.toHaveProperty('HISTOIRE_MCP_TOKEN')
  })

  it('supports book-only and explicit enable without inheriting dev listener settings', () => {
    expect(resolveNodeOptions(true, { PUBLIC_ORIGIN: 'https://book.example' }, ['--no-mcp'])).toMatchObject({ host: '0.0.0.0', port: 3000, mcpEnabled: false })
    expect(resolveNodeOptions(false, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: 'ab'.repeat(32) }, ['--mcp'])).toMatchObject({ port: 0, mcpEnabled: true })
    expect(() => resolveNodeOptions(true, {}, ['--mcp', '--no-mcp'])).toThrow('cannot be combined')
    expect(() => resolveNodeOptions(true, {}, ['--mcp-port', '6007'])).toThrow('Unknown deployed server argument')
  })

  it.each(['https://book.example/path', 'https://book.example/?token=x', 'https://user:secret@book.example', 'file:///tmp/book', 'https://book.example#x'])('rejects non-origin PUBLIC_ORIGIN %s', (origin) => {
    expect(() => resolveNodeOptions(false, { PUBLIC_ORIGIN: origin }, [])).toThrow('PUBLIC_ORIGIN')
  })

  it('defaults target browser policy to automatic and keeps explicit choices exclusive', () => {
    expect(resolveNodeBrowserPolicy({}, '/srv/histoire')).toEqual({ source: 'auto' })
    expect(resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: 'chrome' }, '/srv/histoire')).toEqual({ source: 'chrome' })
    expect(() => resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: 'chrome', HISTOIRE_BROWSER_EXECUTABLE_PATH: '/opt/chrome' }, '/srv/histoire')).toThrow('HISTOIRE_BROWSER_EXECUTABLE_PATH')
    expect(() => resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: 'executable' }, '/srv/histoire')).toThrow('HISTOIRE_BROWSER_EXECUTABLE_PATH')
  })

  it.each(['auto', 'headless-shell', 'chromium', 'chrome', 'msedge'] as const)('accepts deployment browser source %s', (source) => {
    expect(resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: source }, '/srv/histoire')).toEqual({ source })
  })

  it('resolves an explicit target executable relative to the copied artifact root', () => {
    expect(resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: 'executable', HISTOIRE_BROWSER_EXECUTABLE_PATH: 'bin/chrome for tests' }, '/srv/copied book')).toEqual({ source: 'executable', executablePath: resolve('/srv/copied book/bin/chrome for tests') })
  })

  it.each(['', 'https://chrome.example', 'chrome --headless'])('rejects invalid explicit target executable path %s', (path) => {
    expect(() => resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: 'executable', HISTOIRE_BROWSER_EXECUTABLE_PATH: path }, '/srv/histoire')).toThrow()
  })

  it('rejects unsupported target sources without falling back to auto', () => {
    expect(() => resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: 'chromium-beta' }, '/srv/histoire')).toThrow('HISTOIRE_BROWSER_SOURCE')
  })
})
