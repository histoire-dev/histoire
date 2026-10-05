import { describe, expect, it } from 'vitest'
import { createEmbedFrameAncestors, mergeEmbedFrameAncestors, resolveEmbedOrigins, validateHistoireSourceDescriptor } from '../index.js'
import { createProtocolDescriptor } from './fixtures/catalog.js'

describe('portable source descriptor policy', () => {
  it('validates safe lazy references and exact deployment origins', () => {
    const descriptor = {
      ...createProtocolDescriptor(),
      embed: { allowedOrigins: ['https://host.test:8443'], allowOpenInEditor: false, allowServerTests: false },
      assets: { search: 'assets/embed-search.json', content: [{ storyId: 'a:b', docs: 'assets/docs-123.json', rawSource: 'assets/source-123.json' }] },
      config: { title: 'Book', theme: { defaultColorScheme: 'auto', darkClass: 'dark' }, responsivePresets: [{ label: 'Phone', width: 320 }], backgroundPresets: [{ label: 'White', color: '#fff', contrastColor: '#000' }], autoApplyContrastColor: false },
    }
    expect(validateHistoireSourceDescriptor(descriptor)).toBe(descriptor)
    for (const path of ['/private/source', '../secret', 'https://evil.test/source', '//evil.test/source', 'assets\\secret', 'assets/%2e%2e/secret', 'assets/secret?token=x', 'assets/%252e%252e/secret']) {
      expect(() => validateHistoireSourceDescriptor({ ...descriptor, assets: { ...descriptor.assets, search: path } })).toThrow()
    }
    for (const origin of ['*', 'null', 'https://host.test/path', 'https://user:pass@host.test', 'https://host.test/']) {
      expect(() => validateHistoireSourceDescriptor({ ...descriptor, embed: { ...descriptor.embed, allowedOrigins: [origin] } })).toThrow()
    }
    expect(() => validateHistoireSourceDescriptor({ ...descriptor, config: { ...descriptor.config, loader: 'private' } })).toThrow()
    expect(() => validateHistoireSourceDescriptor({ ...descriptor, config: { ...descriptor.config, theme: { darkClass: 'dark' } } })).toThrow()
  })

  it('replaces baked list and fails closed for malformed present deployment override', () => {
    const baked = ['https://baked.test']
    expect(resolveEmbedOrigins(baked)).toEqual(baked)
    expect(resolveEmbedOrigins(baked, { present: true, value: ['https://deploy.test'] })).toEqual(['https://deploy.test'])
    expect(resolveEmbedOrigins(baked, { present: true, value: [] })).toEqual([])
    for (const value of [undefined, null, ['https://deploy.test/path'], '*', ['https://ok.test', 'null']]) {
      expect(resolveEmbedOrigins(baked, { present: true, value })).toEqual([])
    }
    expect(createEmbedFrameAncestors(['https://deploy.test'])).toBe('frame-ancestors \'self\' https://deploy.test')
    expect(mergeEmbedFrameAncestors('script-src \'self\'; FRAME-ANCESTORS \'none\'; connect-src https://api.test', ['https://deploy.test'])).toBe('script-src \'self\'; connect-src https://api.test; frame-ancestors \'self\' https://deploy.test')
    expect(mergeEmbedFrameAncestors(['script-src \'self\'', 'connect-src \'none\''], [])).toEqual(['script-src \'self\'; frame-ancestors \'self\'', 'connect-src \'none\'; frame-ancestors \'self\''])
  })
})
