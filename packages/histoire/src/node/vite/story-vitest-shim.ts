import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import type { BrowserRuntimePaths } from './resolve-paths.js'
import { histoireSharedPath } from './resolve-paths.js'
import { createStoryImporterIdsGetter, isStoryVitestImporter } from './story-importer.js'

const STORY_VITEST_SHIM_ID = '\0virtual:$histoire-story-vitest'

/**
 * Generates the browser-side `vitest` module served to story files.
 *
 * Stories run inside Histoire's own iframe, not inside a Vitest worker, so the
 * real `vitest` entry cannot be used: `describe`/`it` register into Histoire's
 * collection instead of a runner, and `expect`/`vi` are rebuilt from the
 * standalone `@vitest/expect` and `@vitest/spy` packages.
 * @param paths Project module paths the shim re-exports from.
 */
function generateStoryVitestShim(paths: BrowserRuntimePaths) {
  return `
import { registerCollectedTestCase, registerCollectedTestSuite } from ${JSON.stringify(histoireSharedPath)}
import { createCompilerHints } from ${JSON.stringify(paths.vitestMockerBrowser)}
import { chai, JestAsymmetricMatchers, JestChaiExpect, JestExtend, ASYMMETRIC_MATCHERS_OBJECT, GLOBAL_EXPECT, addCustomEqualityTesters, customMatchers, getState, setState } from ${JSON.stringify(paths.vitestExpect)}
import { clearAllMocks, fn, isMockFunction, resetAllMocks, restoreAllMocks, spyOn } from ${JSON.stringify(paths.vitestSpy)}

chai.use(JestExtend)
chai.use(JestChaiExpect)
chai.use(JestAsymmetricMatchers)

function createPreviewExpect() {
  const expect = (value, message) => {
    const { assertionCalls = 0 } = getState(expect) ?? {}
    setState({ assertionCalls: assertionCalls + 1 }, expect)
    return chai.expect(value, message)
  }

  Object.assign(expect, chai.expect)
  Object.assign(expect, globalThis[ASYMMETRIC_MATCHERS_OBJECT])

  expect.getState = () => getState(expect)
  expect.setState = state => setState(state, expect)

  setState({
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
    currentTestName: '',
  }, expect)

  expect.assert = chai.assert
  expect.extend = matchers => chai.expect.extend(expect, matchers)
  expect.addEqualityTesters = customTesters => addCustomEqualityTesters(customTesters)
  expect.soft = (...args) => expect(...args).withContext({ soft: true })
  expect.unreachable = message => {
    chai.assert.fail(\`expected\${message ? \` "\${message}" \` : ' '}not to be reached\`)
  }

  chai.util.addMethod(expect, 'assertions', expected => {
    const errorGen = () => new Error(\`expected number of assertions to be \${expected}, but got \${expect.getState().assertionCalls}\`)
    expect.setState({
      expectedAssertionsNumber: expected,
      expectedAssertionsNumberErrorGen: errorGen,
    })
  })

  chai.util.addMethod(expect, 'hasAssertions', () => {
    expect.setState({
      isExpectingAssertions: true,
      isExpectingAssertionsError: new Error('expected any number of assertion, but got none'),
    })
  })

  expect.extend(customMatchers)

  return expect
}

const expect = globalThis[GLOBAL_EXPECT] ?? createPreviewExpect()
if (globalThis[GLOBAL_EXPECT] !== expect) {
  Object.defineProperty(globalThis, GLOBAL_EXPECT, {
    value: expect,
    writable: true,
    configurable: true,
  })
}

const compilerHints = createCompilerHints({
  globalThisKey: '__vitest_mocker__',
})

export const vi = {
  ...compilerHints,
  clearAllMocks,
  fn,
  isMockFunction,
  mocked(value) {
    return value
  },
  resetAllMocks,
  restoreAllMocks,
  spyOn,
}

export const vitest = vi
export { expect }
export const assert = chai.assert
export const should = chai.should
export const expectTypeOf = () => ({})
export function inject() {}
export const mocker = globalThis.__vitest_mocker__
export function onTestFailed() {}

export const describe = Object.assign(
  (name, fn) => {
    registerCollectedTestSuite(name, fn)
  },
  {
    only(name, fn) {
      registerCollectedTestSuite(name, fn, 'only')
    },
    skip(name, fn) {
      registerCollectedTestSuite(name, fn, 'skip')
    },
    todo(name, fn) {
      registerCollectedTestSuite(name, fn, 'todo')
    },
  },
)

export const it = Object.assign(
  (name, fn) => {
    registerCollectedTestCase(name, fn)
  },
  {
    only(name, fn) {
      registerCollectedTestCase(name, fn, 'only')
    },
    skip(name, fn) {
      registerCollectedTestCase(name, fn, 'skip')
    },
    todo(name, fn) {
      registerCollectedTestCase(name, fn, 'todo')
    },
  },
)

export const test = it

export function beforeAll() {}
export function beforeEach() {}
export function afterAll() {}
export function afterEach() {}
`
}

/**
 * Serves the browser-compatible `vitest` shim to story files.
 *
 * Only story files are redirected: everything else (the app, helpers imported
 * by real spec files) keeps the real `vitest` resolution.
 * @param ctx The histoire context.
 * @param paths Project module paths the shim re-exports from.
 */
export function createStoryVitestShimPlugin(ctx: Context, paths: BrowserRuntimePaths): VitePlugin {
  const getStoryImporterIds = createStoryImporterIdsGetter(ctx)

  return {
    name: 'histoire:story-vitest-shim',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'vitest' && isStoryVitestImporter(importer, getStoryImporterIds(), ctx.root)) {
        return STORY_VITEST_SHIM_ID
      }
    },
    load(id) {
      if (id !== STORY_VITEST_SHIM_ID) {
        return
      }

      return generateStoryVitestShim(paths)
    },
  }
}
