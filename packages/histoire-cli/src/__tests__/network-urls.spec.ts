import type { InterfaceTable } from '../terminal/info/network.js'
import { describe, expect, it } from 'vitest'
import { deriveNetworkUrls } from '../terminal/info/network.js'

const entry = (address: string, internal = false, family: 'IPv4' | 'IPv6' = 'IPv4') => ({ address, internal, family, netmask: '', mac: '', cidr: null }) as InterfaceTable[string] extends readonly (infer E)[] | undefined ? E : never
const interfaces: InterfaceTable = {
  lo: [entry('127.0.0.1', true)],
  eth0: [entry('192.168.1.20'), entry('fe80::1', false, 'IPv6')],
  wlan0: [entry('10.0.0.7')],
}
const publicUrl = 'http://localhost:6007/'

describe('network URLs', () => {
  it('advertises nothing for loopback-only bindings', () => {
    for (const host of [undefined, false, 'localhost', '127.0.0.1', '::1', '[::1]'] as const) {
      expect(deriveNetworkUrls({ host, publicUrl, interfaces })).toEqual([])
    }
  })

  it('lists every external IPv4 address with the actual (fallback) port for wildcard bindings', () => {
    const expected = ['http://192.168.1.20:6007/', 'http://10.0.0.7:6007/']
    expect(deriveNetworkUrls({ host: true, publicUrl, interfaces })).toEqual(expected)
    expect(deriveNetworkUrls({ host: '0.0.0.0', publicUrl, interfaces })).toEqual(expected)
  })

  it('uses a specific configured address, and invents nothing without interfaces or a bound address', () => {
    expect(deriveNetworkUrls({ host: '192.168.1.20', publicUrl, interfaces })).toEqual(['http://192.168.1.20:6007/'])
    expect(deriveNetworkUrls({ host: '2001:db8::5', publicUrl, interfaces })).toEqual(['http://[2001:db8::5]:6007/'])
    expect(deriveNetworkUrls({ host: true, publicUrl, interfaces: { lo: [entry('127.0.0.1', true)] } })).toEqual([])
    expect(deriveNetworkUrls({ host: true, publicUrl: undefined, interfaces })).toEqual([])
  })
})
