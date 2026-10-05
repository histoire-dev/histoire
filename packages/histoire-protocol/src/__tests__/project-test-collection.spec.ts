import { describe, expect, it } from 'vitest'
import { validateProjectTestCollection } from '../bridge/project-test-collection.js'

/** Collection envelope deliberately contains opaque delimiter-colliding identities. */
function collection() {
  return { execution: { runId: 'collect', mode: 'server' }, variants: [{ target: { storyId: 'a:b', variantId: 'c' }, collection: { definitions: [] } }, { target: { storyId: 'a', variantId: 'b:c' }, collection: { definitions: [{ id: '0', name: 'todo', fullName: 'todo', mode: 'todo' }] } }] }
}

describe('project test collection validation', () => {
  it('accepts empty and skipped definitions under distinct tuple identities', () => {
    expect(() => validateProjectTestCollection(collection())).not.toThrow()
  })
  it('rejects duplicates, null variants, malformed definitions, and preview attribution', () => {
    const result = collection()
    expect(() => validateProjectTestCollection({ ...result, variants: [result.variants[0], result.variants[0]] })).toThrow('Duplicate project collection target')
    expect(() => validateProjectTestCollection({ ...result, variants: [{ ...result.variants[0], target: { storyId: 'a', variantId: null } }] })).toThrow('Project collection requires variant identity')
    expect(() => validateProjectTestCollection({ ...result, variants: [{ ...result.variants[0], collection: { definitions: [{}] } }] })).toThrow('Invalid test definition')
    expect(() => validateProjectTestCollection(result, [result.variants[0].target])).toThrow('Test discovery target inventory changed')
    expect(() => validateProjectTestCollection(result, [result.variants[0].target, { storyId: 'foreign', variantId: 'variant' }])).toThrow('Test discovery target inventory changed')
    expect(() => validateProjectTestCollection({ ...result, execution: { runId: 'collect', mode: 'preview', target: { storyId: 'a', variantId: 'b' }, sourceId: 'source', epoch: 'epoch', revision: 'revision', runtimeId: 'runtime' } })).toThrow('Invalid project collection engine')
  })
})
