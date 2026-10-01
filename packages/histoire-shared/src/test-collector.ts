import type { HistoireTestAroundHook, HistoireTestContext, HistoireTestDefinition, HistoireTestHook, HistoireTestHookKind, HistoireTestHookScope, HistoireTestMode, HistoireTestRegistration } from './types/test.js'
import { tagStoryExecution } from './test-execution.js'

export const TEST_REGISTRY_KEY = '__HST_TEST_REGISTRY__'
export const TEST_DEFINITIONS_KEY = '__HST_TEST_DEFINITIONS__'

const ACTIVE_TEST_COLLECTOR_KEY = '__HST_ACTIVE_TEST_COLLECTOR__'

interface HistoireActiveTestCollector {
  cases: HistoireTestDefinition[]
  nextId: number
  hookScopes: HistoireTestHookScope[]
  suiteModes: HistoireTestMode[]
  suiteStack: string[]
}

/** Creates an empty mutable lifecycle scope for one registration or suite. */
function createHookScope(name: string, fullName: string): HistoireTestHookScope {
  return {
    suite: {
      type: 'suite',
      name,
      fullName,
    },
    aroundAll: [],
    aroundEach: [],
    beforeAll: [],
    beforeEach: [],
    afterEach: [],
    afterAll: [],
  }
}

function getActiveCollector() {
  return (globalThis as typeof globalThis & {
    [ACTIVE_TEST_COLLECTOR_KEY]?: HistoireActiveTestCollector
  })[ACTIVE_TEST_COLLECTOR_KEY]
}

export function pushHistoireTestRegistration(register: HistoireTestRegistration) {
  const globals = globalThis as typeof globalThis & {
    [TEST_DEFINITIONS_KEY]?: HistoireTestRegistration[]
    [TEST_REGISTRY_KEY]?: HistoireTestRegistration[]
  }

  // Remember which story mount emitted this registration so collection can tell
  // "the same setup ran twice" from "one setup registered twice".
  tagStoryExecution(register)

  if (Array.isArray(globals[TEST_DEFINITIONS_KEY])) {
    globals[TEST_DEFINITIONS_KEY].push(register)
  }

  if (Array.isArray(globals[TEST_REGISTRY_KEY])) {
    globals[TEST_REGISTRY_KEY].push(register)
  }
}

/**
 * Registers a collected suite and applies suite mode to nested test cases.
 */
export function registerCollectedTestSuite(_name: string, fn?: () => void, mode: HistoireTestMode = 'run') {
  const collector = getActiveCollector()
  if (!collector) {
    return
  }

  collector.suiteStack.push(_name)
  collector.hookScopes.push(createHookScope(_name, collector.suiteStack.join(' > ')))
  if (mode !== 'run') {
    collector.suiteModes.push(mode)
  }

  try {
    fn?.()
  }
  finally {
    if (mode !== 'run') {
      collector.suiteModes.pop()
    }

    collector.hookScopes.pop()
    collector.suiteStack.pop()
  }
}

/**
 * Registers a Vitest lifecycle hook on the active suite scope.
 * Calls outside active Histoire collection are ignored.
 * @param kind Lifecycle phase.
 * @param handler Callback registered by story code.
 */
export function registerCollectedTestHook(kind: HistoireTestHookKind, handler: HistoireTestHook, timeout?: number) {
  const scope = getActiveCollector()?.hookScopes.at(-1)
  scope?.[kind].push({ handler, timeout })
}

/** Registers a Vitest 4.1 lifecycle wrapper on current suite scope. */
export function registerCollectedAroundHook(
  kind: 'aroundAll' | 'aroundEach',
  handler: HistoireTestAroundHook,
  timeout?: number,
) {
  const scope = getActiveCollector()?.hookScopes.at(-1)
  scope?.[kind].push({ handler, timeout })
}

/**
 * Registers a collected test case for the active collector.
 */
export function registerCollectedTestCase(
  name: string,
  handler?: HistoireTestDefinition['handler'],
  timeoutOrMode?: number | HistoireTestMode,
  mode: HistoireTestMode = 'run',
) {
  const collector = getActiveCollector()
  if (!collector) {
    return
  }
  const timeout = typeof timeoutOrMode === 'number' ? timeoutOrMode : undefined
  const resolvedMode = resolveCollectedTestMode(collector, typeof timeoutOrMode === 'string' ? timeoutOrMode : mode)
  const shouldKeepHandler = resolvedMode !== 'skip' && resolvedMode !== 'todo'

  collector.cases.push({
    id: String(collector.nextId++),
    name,
    fullName: [...collector.suiteStack, name].join(' > '),
    ...(resolvedMode !== 'run' ? { mode: resolvedMode } : {}),
    ...(shouldKeepHandler ? { handler } : {}),
    ...(timeout === undefined ? {} : { timeout }),
    hookScopes: [...collector.hookScopes],
  })
}

/**
 * Resolves explicit test mode against inherited suite modifiers.
 */
function resolveCollectedTestMode(collector: HistoireActiveTestCollector, mode: HistoireTestMode) {
  if (mode === 'skip' || mode === 'todo') {
    return mode
  }

  if (collector.suiteModes.includes('skip')) {
    return 'skip'
  }

  if (collector.suiteModes.includes('todo')) {
    return 'todo'
  }

  if (mode === 'only' || collector.suiteModes.includes('only')) {
    return 'only'
  }

  return 'run'
}

export function collectHistoireTests(
  registrations: HistoireTestRegistration[],
  context: HistoireTestContext,
) {
  const collector: HistoireActiveTestCollector = {
    cases: [],
    nextId: 0,
    hookScopes: [],
    suiteModes: [],
    suiteStack: [],
  }
  const globals = globalThis as typeof globalThis & {
    [ACTIVE_TEST_COLLECTOR_KEY]?: HistoireActiveTestCollector
  }
  const previousCollector = globals[ACTIVE_TEST_COLLECTOR_KEY]
  globals[ACTIVE_TEST_COLLECTOR_KEY] = collector

  try {
    for (const register of registrations) {
      collector.hookScopes.push(createHookScope('', ''))
      try {
        register(context)
      }
      finally {
        collector.hookScopes.pop()
      }
    }
  }
  finally {
    globals[ACTIVE_TEST_COLLECTOR_KEY] = previousCollector
  }

  return collector.cases
}
