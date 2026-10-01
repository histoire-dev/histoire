import type { BrowserRuntimePaths } from '../resolve-paths.js'
import { histoireSharedPath } from '../resolve-paths.js'
import { STORY_COLLECTORS_CODE } from './collectors.js'
import { STORY_COMPATIBILITY_CODE } from './compatibility.js'
import { STORY_EXPECT_CODE } from './expect.js'
import { STORY_MOCKS_CODE } from './mocks.js'
import { STORY_POLLING_CODE } from './polling.js'

/**
 * Replaces Vitest's worker entry in story iframes: declarations register with
 * Histoire, while standalone Vitest expect, spy, and mocker packages provide
 * assertions and mocks.
 *
 * Assembles one browser module from focused source fragments. Keeping a single
 * emitted module preserves shared expect, mock, and collector state in dev and
 * static builds without adding virtual-module resolution rules.
 */
export function generateStoryVitestShim(paths: BrowserRuntimePaths) {
  return `
import { createHistoireSuiteCollector, createHistoireTestCollector, registerCollectedAroundHook, registerCollectedTestHook, registerHistoireTestTaskCallback } from ${JSON.stringify(histoireSharedPath)}
import { createCompilerHints } from ${JSON.stringify(paths.vitestMockerBrowser)}
import { chai, JestAsymmetricMatchers, JestChaiExpect, JestExtend, ASYMMETRIC_MATCHERS_OBJECT, GLOBAL_EXPECT, addCustomEqualityTesters, customMatchers, getState, setState } from ${JSON.stringify(paths.vitestExpect)}
import { clearAllMocks, fn, isMockFunction, resetAllMocks, restoreAllMocks, spyOn } from ${JSON.stringify(paths.vitestSpy)}

${STORY_EXPECT_CODE}
${STORY_POLLING_CODE}
${STORY_MOCKS_CODE}
${STORY_COMPATIBILITY_CODE}
${STORY_COLLECTORS_CODE}
`
}
