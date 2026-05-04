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

  it('collects skipped tests and skipped suites', () => {
    const definitions = collectHistoireTests([
      () => {
        collectDescribe('my component', () => {
          collectIt.skip('does not run', () => {
            throw new Error('Skipped test should not run')
          })

          collectDescribe.skip('disabled states', () => {
            collectIt('also does not run', () => {
              throw new Error('Skipped suite test should not run')
            })
          })
        })
      },
    ], {
      story: {} as any,
      variant: {} as any,
      canvas: {} as HTMLElement,
    })

    expect(definitions).toMatchObject([
      {
        name: 'does not run',
        fullName: 'my component > does not run',
        mode: 'skip',
      },
      {
        name: 'also does not run',
        fullName: 'my component > disabled states > also does not run',
        mode: 'skip',
      },
    ])
    expect(definitions[0].handler).toBeUndefined()
    expect(definitions[1].handler).toBeUndefined()
  })

  it('collects only and todo test modifiers', () => {
    const definitions = collectHistoireTests([
      () => {
        collectDescribe.only('focused suite', () => {
          collectIt('inherits only mode', () => {})
        })

        collectIt.only('runs focused test', () => {})
        collectIt.todo('documents missing behavior')

        collectDescribe.todo('future suite', () => {
          collectIt('also documents missing behavior', () => {})
        })
      },
    ], {
      story: {} as any,
      variant: {} as any,
      canvas: {} as HTMLElement,
    })

    expect(definitions).toMatchObject([
      {
        name: 'inherits only mode',
        fullName: 'focused suite > inherits only mode',
        mode: 'only',
      },
      {
        name: 'runs focused test',
        fullName: 'runs focused test',
        mode: 'only',
      },
      {
        name: 'documents missing behavior',
        fullName: 'documents missing behavior',
        mode: 'todo',
      },
      {
        name: 'also documents missing behavior',
        fullName: 'future suite > also documents missing behavior',
        mode: 'todo',
      },
    ])
    expect(definitions[0].handler).toBeTypeOf('function')
    expect(definitions[1].handler).toBeTypeOf('function')
    expect(definitions[2].handler).toBeUndefined()
    expect(definitions[3].handler).toBeUndefined()
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
