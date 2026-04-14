import { collectHistoireTests } from '@histoire/shared/src/test-collector.js'
import { mergeTestDefinitionsAndSummary } from '@histoire/shared/src/types/test.js'
import { describe, expect, it } from 'vitest'
import { describe as collectDescribe, it as collectIt } from '../vendors/vitest-collect.js'

describe('collectHistoireTests', () => {
  it('collects nested suite names and preserves duplicate leaf names', async () => {
    const canvas = {
      textContent: 'Mocked by Vitest for Vitest browser mode',
    } as HTMLElement

    const definitions = collectHistoireTests([
      ({ canvas }) => {
        collectDescribe('my component', () => {
          collectIt('works', () => {
            expect(canvas.textContent).toContain('Mocked by Vitest')
          })

          collectDescribe('states', () => {
            collectIt('works', () => {})
          })
        })
      },
    ], {
      story: {} as any,
      variant: {} as any,
      canvas,
    })

    expect(definitions.map(({ id, name, fullName }) => ({
      id,
      name,
      fullName,
    }))).toEqual([
      {
        id: '0',
        name: 'works',
        fullName: 'my component > works',
      },
      {
        id: '1',
        name: 'works',
        fullName: 'my component > states > works',
      },
    ])

    await definitions[0].handler?.()
  })

  it('keeps collected definitions visible before they have run', () => {
    expect(mergeTestDefinitionsAndSummary([
      {
        id: '0',
        name: 'renders the mocked dependency output',
        fullName: 'mocked module in story setup > renders the mocked dependency output',
      },
      {
        id: '1',
        name: 'tracks calls through the mocked module function',
        fullName: 'mocked module in story setup > tracks calls through the mocked module function',
      },
    ], {
      ok: true,
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      errors: [],
      tests: [{
        id: '0',
        name: 'renders the mocked dependency output',
        fullName: 'story > variant > mocked module in story setup > renders the mocked dependency output',
        state: 'passed',
        errors: [],
      }],
    })).toEqual([
      {
        id: '0',
        name: 'renders the mocked dependency output',
        fullName: 'mocked module in story setup > renders the mocked dependency output',
        state: 'passed',
        errors: [],
        storyId: undefined,
        variantId: undefined,
      },
      {
        id: '1',
        name: 'tracks calls through the mocked module function',
        fullName: 'mocked module in story setup > tracks calls through the mocked module function',
        state: 'idle',
        errors: [],
        storyId: undefined,
        variantId: undefined,
      },
    ])
  })

  it('preserves explicit collected ids in summaries', () => {
    expect(mergeTestDefinitionsAndSummary([
      {
        id: '0',
        name: 'renders',
        fullName: 'suite > renders',
      },
    ], {
      ok: true,
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      errors: [],
      tests: [{
        id: '0',
        name: 'renders',
        fullName: 'suite > renders',
        state: 'passed',
        errors: [],
      }],
    })[0].state).toBe('passed')
  })
})
