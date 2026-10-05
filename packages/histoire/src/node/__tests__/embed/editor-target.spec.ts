import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveEmbedEditorTarget } from '../../virtual/embed/editor.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

describe('finite embed editor target', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => fixture = await createEmbedSourceFixture())
  afterEach(() => fixture.close())

  it('resolves registered physical target independent of cwd and never accepts arbitrary path', () => {
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    const target = { storyId: fixture.story.story.id, variantId: fixture.story.story.variants[0].id }
    const input = { target, epoch: descriptor.epoch, revision: descriptor.revision }
    expect(resolveEmbedEditorTarget(fixture.catalog.current!, descriptor, input)).toBe(fixture.story.path)
    expect(() => resolveEmbedEditorTarget(fixture.catalog.current!, descriptor, { ...input, file: '/private/file' })).toThrow('Invalid editor request fields')
    expect(() => resolveEmbedEditorTarget(fixture.catalog.current!, descriptor, { ...input, target: { storyId: '../../private', variantId: 'unknown' } })).toThrow('Story not found')
    expect(() => resolveEmbedEditorTarget(fixture.catalog.current!, descriptor, { ...input, revision: 'old' })).toThrow('Editor source publication changed')
  })

  it('rejects static source before editor acquisition', () => {
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    descriptor.mode = 'static'
    expect(() => resolveEmbedEditorTarget(fixture.catalog.current!, descriptor, {})).toThrow('Editor is available only in dev')
  })
})
