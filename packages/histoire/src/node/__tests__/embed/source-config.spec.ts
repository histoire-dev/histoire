import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from '../../config/defaults.js'
import { resolveEmbedConfig } from '../../config/embed.js'

describe('opt-in source embedding configuration', () => {
  it('defaults disabled independently of MCP and validates exact origins', () => {
    expect(resolveEmbedConfig(getDefaultConfig().embed)).toEqual({ enabled: false, allowedOrigins: [], allowOpenInEditor: false, allowServerTests: false, channels: [] })
    expect(resolveEmbedConfig({ enabled: true, allowedOrigins: ['https://host.test:8443', 'https://host.test:8443'] })).toMatchObject({ enabled: true, allowedOrigins: ['https://host.test:8443'] })
    for (const embed of [{ enabled: 'yes' }, { allowedOrigins: '*' }, { allowedOrigins: ['https://host.test/path'] }, { allowOpenInEditor: 1 }, { allowServerTests: null }]) {
      expect(() => resolveEmbedConfig(embed as any)).toThrow()
    }
  })
  it('requires finite opt-in channel names without changing origin authority', () => {
    expect(resolveEmbedConfig({ enabled: true, channels: ['factory', 'factory'] })).toMatchObject({ channels: ['factory'], allowedOrigins: [] })
    for (const channels of ['*', ['Factory'], ['a/b'], ['a'.repeat(33)]]) expect(() => resolveEmbedConfig({ channels } as any)).toThrow()
  })
})
