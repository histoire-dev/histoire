import { describe, expect, it } from 'vitest'
import { getIgnoredPublicAddressWarnings } from '../vite/dev-proxy.js'

const transport = { origin: 'http://localhost:6006', generation: 'g' }

describe('ignored public address options', () => {
  it('stays silent for the port Histoire merges by default', () => {
    expect(getIgnoredPublicAddressWarnings({ port: 6006 }, transport)).toEqual([])
    expect(getIgnoredPublicAddressWarnings(undefined, transport)).toEqual([])
  })

  it('reports a configured port with the flag that replaces it', () => {
    expect(getIgnoredPublicAddressWarnings({ port: 2000 }, transport)).toEqual(['server.port (2000) is ignored by `histoire dev`: use `histoire dev --port 2000`'])
  })

  it('reports a configured host with the flag that replaces it', () => {
    expect(getIgnoredPublicAddressWarnings({ host: '0.0.0.0' }, transport)).toEqual(['server.host is ignored by `histoire dev`: use `histoire dev --host 0.0.0.0`'])
    expect(getIgnoredPublicAddressWarnings({ host: true }, transport)).toEqual(['server.host is ignored by `histoire dev`: use `histoire dev --host`'])
  })

  it('stays silent once the command line owns the option', () => {
    expect(getIgnoredPublicAddressWarnings({ port: 2000, host: true }, { ...transport, cli: { port: true, host: true } })).toEqual([])
  })
})
