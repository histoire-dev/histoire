import { describe, expect, it } from 'vitest'
import { validateBridgeResult, validateHistoireTestExecution } from '../index.js'

describe('portable test execution ownership', () => {
  it('accepts exact preview authority and Node multi-target server identity', () => {
    expect(() => validateHistoireTestExecution({ runId: 'request', mode: 'preview', sourceId: 'source', epoch: 'epoch', revision: 'revision', target: { storyId: 'story', variantId: 'variant' }, runtimeId: 'document' })).not.toThrow()
    expect(() => validateHistoireTestExecution({ runId: 'run', mode: 'server' })).not.toThrow()
  })

  it('rejects partial source identity, mismatched runtime mode and private/arbitrary metadata', () => {
    for (const execution of [{ runId: 'run', mode: 'server', epoch: 'epoch' }, { runId: 'run', mode: 'server', runtimeId: 'document' }, { runId: 'run', mode: 'preview' }, { runId: 'run', mode: 'server', privatePath: '/secret' }]) {
      expect(() => validateHistoireTestExecution(execution)).toThrow()
    }
  })

  it('validates additive ownership before accepting collection or summary', () => {
    expect(() => validateBridgeResult('tests.collect', { definitions: [], execution: { runId: 'run', mode: 'preview' } })).toThrow()
    expect(() => validateBridgeResult('tests.run', { ok: true, total: 0, passed: 0, failed: 0, skipped: 0, tests: [], errors: [], execution: { runId: 'run', mode: 'server' } })).not.toThrow()
  })
})
