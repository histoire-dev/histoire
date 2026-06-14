import type { OutputBundle } from 'rollup'
import { describe, expect, it } from 'vitest'
import { entryCssMergerPlugin } from '../entry-css-merger.js'
import { USER_CSS_MARK_END, USER_CSS_MARK_START } from '../vite-plugin.js'

function fakeChunk(name: string, importedCss: string[], code = '', extra: Partial<any> = {}) {
  return {
    type: 'chunk' as const,
    name,
    fileName: `${name}.js`,
    code,
    isEntry: true,
    viteMetadata: { importedCss: new Set(importedCss), importedAssets: new Set() },
    facadeModuleId: null,
    moduleIds: [],
    imports: [],
    dynamicImports: [],
    exports: [],
    map: null,
    modules: {},
    ...extra,
  } as any
}

function fakeAsset(fileName: string, source: string) {
  return { type: 'asset' as const, fileName, source, name: fileName, needsCodeReference: false } as any
}

function mark(css: string): string {
  return `${USER_CSS_MARK_START}\n${css}\n${USER_CSS_MARK_END}\n`
}

describe('entry-css-merger', () => {
  it('produces one CSS asset per entry chunk', async () => {
    const plugin = entryCssMergerPlugin()
    const bundle: OutputBundle = {
      'bundle-main.js': fakeChunk('bundle-main', ['route1.css', 'route2.css']),
      'bundle-sandbox.js': fakeChunk('bundle-sandbox', ['sandbox-route.css']),
      'route1.css': fakeAsset('route1.css', 'a {}'),
      'route2.css': fakeAsset('route2.css', 'b {}'),
      'sandbox-route.css': fakeAsset('sandbox-route.css', 'c {}'),
    }
    await (plugin.generateBundle as any).call({ emitFile: () => '' }, {}, bundle)

    const cssAssets = Object.values(bundle).filter(a => a.type === 'asset' && a.fileName.endsWith('.css'))
    expect(cssAssets).toHaveLength(2)
    const mainCss = cssAssets.find(a => a.fileName === 'bundle-main.css')
    const sandboxCss = cssAssets.find(a => a.fileName === 'bundle-sandbox.css')
    expect(mainCss?.source).toContain('a {}')
    expect(mainCss?.source).toContain('b {}')
    expect(sandboxCss?.source).toContain('c {}')
  })

  it('wraps marked user CSS in @scope on the main entry when isolation is enabled', async () => {
    const plugin = entryCssMergerPlugin({
      isolateStyles: true,
      scopeRoot: '.__histoire-render-story',
      mainEntryName: 'bundle-main',
    })
    const bundle: OutputBundle = {
      'bundle-main.js': fakeChunk('bundle-main', ['user.css', 'chrome.css']),
      'user.css': fakeAsset('user.css', mark('body { color: red }')),
      'chrome.css': fakeAsset('chrome.css', '@scope (.histoire-app-root) { .x {} }'),
    }
    await (plugin.generateBundle as any).call({ emitFile: () => '' }, {}, bundle)

    const main = Object.values(bundle).find(a => a.type === 'asset' && a.fileName === 'bundle-main.css') as any
    expect(main.source).toContain('@scope (.__histoire-render-story)')
    expect(main.source).toContain('color: red')
    expect(main.source).toContain('@scope (.histoire-app-root)')
    expect(main.source).not.toContain(USER_CSS_MARK_START)
  })

  it('strips markers without wrapping on the sandbox entry', async () => {
    const plugin = entryCssMergerPlugin({
      isolateStyles: true,
      scopeRoot: '.__histoire-render-story',
      mainEntryName: 'bundle-main',
    })
    const bundle: OutputBundle = {
      'bundle-sandbox.js': fakeChunk('bundle-sandbox', ['user.css']),
      'user.css': fakeAsset('user.css', mark('body { color: red }')),
    }
    await (plugin.generateBundle as any).call({ emitFile: () => '' }, {}, bundle)

    const sandbox = Object.values(bundle).find(a => a.type === 'asset' && a.fileName === 'bundle-sandbox.css') as any
    expect(sandbox.source).toContain('body')
    expect(sandbox.source).toContain('color: red')
    expect(sandbox.source).not.toContain('@scope')
    expect(sandbox.source).not.toContain(USER_CSS_MARK_START)
  })

  it('attributes CSS from transitively-imported chunks (e.g. vendor)', async () => {
    const plugin = entryCssMergerPlugin()
    const main = fakeChunk('bundle-main', ['app.css'], '', { imports: ['vendor.js'], isEntry: true })
    main.fileName = 'bundle-main.js'
    const vendor = { ...fakeChunk('vendor', ['vendor.css']), isEntry: false, fileName: 'vendor.js' }
    const bundle: OutputBundle = {
      'bundle-main.js': main,
      'vendor.js': vendor,
      'app.css': fakeAsset('app.css', '.app {}'),
      'vendor.css': fakeAsset('vendor.css', '.vendor {}'),
    }
    await (plugin.generateBundle as any).call({ emitFile: () => '' }, {}, bundle)
    const mainCss = Object.values(bundle).find(a => a.type === 'asset' && a.fileName === 'bundle-main.css') as any
    expect(mainCss.source).toContain('.app')
    expect(mainCss.source).toContain('.vendor')
  })

  it('strips markers without wrapping when isolation is disabled', async () => {
    const plugin = entryCssMergerPlugin({
      isolateStyles: false,
      scopeRoot: '.__histoire-render-story',
      mainEntryName: 'bundle-main',
    })
    const bundle: OutputBundle = {
      'bundle-main.js': fakeChunk('bundle-main', ['user.css']),
      'user.css': fakeAsset('user.css', mark('body { color: red }')),
    }
    await (plugin.generateBundle as any).call({ emitFile: () => '' }, {}, bundle)

    const main = Object.values(bundle).find(a => a.type === 'asset' && a.fileName === 'bundle-main.css') as any
    expect(main.source).not.toContain('@scope')
    expect(main.source).not.toContain(USER_CSS_MARK_START)
  })
})
