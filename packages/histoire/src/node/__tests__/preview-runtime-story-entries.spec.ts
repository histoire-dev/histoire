import { describe, expect, it } from 'vitest'
import { buildStoryEntryLoaders, buildStoryEntryModule, getStoryEntrySpecifier, parseStoryEntryId } from '../virtual/preview-runtime/story-entries.js'
import { generatePreviewRuntimeSource, HOSTILE_STORY_ID, previewRuntimeStubStoryFiles } from './utils/preview-runtime-source.js'

/**
 * Evaluates a generated story entry module, with dynamic imports recorded
 * instead of executed.
 * @param code Emitted ES module source.
 */
function evaluateEntry(code: string) {
  const imports: string[] = []
  const exports: Record<string, any> = {}
  // eslint-disable-next-line no-new-func -- generated module source under test
  new Function('exports', '__import', code
    .replace(/export const (\w+) =/g, 'exports.$1 =')
    .replace(/\bimport\(/g, '__import('))(exports, (id: string) => imports.push(id))
  return { exports, imports }
}

describe('preview runtime story entries', () => {
  const [plain, documented] = previewRuntimeStubStoryFiles

  it('keeps story metadata out of the lazy runtime source', () => {
    const source = generatePreviewRuntimeSource(true, { lazyStoryEntries: true })

    expect(source).not.toContain('# Card')
    expect(source).not.toContain(documented.filePath)
    expect(source).toContain(JSON.stringify(getStoryEntrySpecifier(documented, true)))
    expect(source).toContain('loadStoryEntry,')
  })

  it('versions an entry by its content so unchanged metadata keeps a cacheable URL', () => {
    const specifier = getStoryEntrySpecifier(plain, true)
    const renamed = { ...plain, story: { ...plain.story, title: 'Renamed' } }

    expect(specifier).toMatch(/\?v=hst-[\w-]+$/)
    expect(getStoryEntrySpecifier({ ...plain }, true)).toBe(specifier)
    expect(getStoryEntrySpecifier(renamed, true)).not.toBe(specifier)
  })

  it('round-trips hostile story ids through the entry module id', () => {
    const hostile = previewRuntimeStubStoryFiles.find(file => file.id === HOSTILE_STORY_ID)!
    const specifier = getStoryEntrySpecifier(hostile, true)

    expect(parseStoryEntryId(`\0${specifier}`)).toBe(HOSTILE_STORY_ID)
    expect(buildStoryEntryLoaders([hostile], true)[0]).toContain(JSON.stringify(specifier))
  })

  it('exports the story metadata and its module loader', () => {
    const { exports, imports } = evaluateEntry(buildStoryEntryModule(documented, { hmr: false }))

    expect(exports.file).toEqual(documented)
    exports.load()
    expect(imports).toEqual([documented.moduleId])
  })

  it('exports no entry for an unknown story', () => {
    const { exports } = evaluateEntry(buildStoryEntryModule(undefined, { hmr: true }))

    expect(exports.file).toBeNull()
    expect(exports.load).toBeNull()
  })
})
