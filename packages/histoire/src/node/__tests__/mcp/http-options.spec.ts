import { describe, expect, it } from 'vitest'
import { resolveDevMcpOptions } from '../../mcp/transport/http-options.js'

describe('dev MCP option precedence', () => {
  it('defaults to enabled loopback policy without explicit port', () => {
    expect(resolveDevMcpOptions(undefined, {})).toEqual({ enabled: true, port: 6007, explicitPort: false })
    expect(resolveDevMcpOptions({}, {})).toEqual({ enabled: true, port: 6007, explicitPort: false })
  })

  it('supports config opt-out and explicit CLI overrides', () => {
    expect(resolveDevMcpOptions(false, {}).enabled).toBe(false)
    expect(resolveDevMcpOptions(false, { mcp: true }).enabled).toBe(true)
    expect(resolveDevMcpOptions(true, { mcp: false }).enabled).toBe(false)
    expect(resolveDevMcpOptions({ enabled: false, port: 6010 }, {}).enabled).toBe(false)
    expect(resolveDevMcpOptions(false, { 'mcp-port': '0' })).toEqual({ enabled: true, port: 0, explicitPort: true })
    expect(resolveDevMcpOptions({ port: 6010 }, { 'mcp-port': '6020' }).port).toBe(6020)
  })

  it('rejects invalid ports and conflicting disable/port arguments', () => {
    for (const port of [-1, 65536, 1.5, '', 'invalid']) expect(() => resolveDevMcpOptions(true, { 'mcp-port': port })).toThrow('MCP port')
    expect(() => resolveDevMcpOptions(true, { 'mcp': false, 'mcp-port': 0 })).toThrow('--no-mcp')
    expect(() => resolveDevMcpOptions(true, { 'mcp': true, 'no-mcp': true })).toThrow('--mcp')
  })
})
