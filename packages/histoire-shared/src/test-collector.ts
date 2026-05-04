import type { HistoireTestContext, HistoireTestDefinition, HistoireTestMode, HistoireTestRegistration } from './types/test.js'

export const TEST_REGISTRY_KEY = '__HST_TEST_REGISTRY__'
export const TEST_DEFINITIONS_KEY = '__HST_TEST_DEFINITIONS__'

const ACTIVE_TEST_COLLECTOR_KEY = '__HST_ACTIVE_TEST_COLLECTOR__'

interface HistoireActiveTestCollector {
  cases: HistoireTestDefinition[]
  nextId: number
  suiteModes: HistoireTestMode[]
  suiteStack: string[]
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

    collector.suiteStack.pop()
  }
}

/**
 * Registers a collected test case for the active collector.
 */
export function registerCollectedTestCase(name: string, handler?: () => Promise<void> | void, mode: HistoireTestMode = 'run') {
  const collector = getActiveCollector()
  if (!collector) {
    return
  }
  const resolvedMode = resolveCollectedTestMode(collector, mode)
  const shouldKeepHandler = resolvedMode !== 'skip' && resolvedMode !== 'todo'

  collector.cases.push({
    id: String(collector.nextId++),
    name,
    fullName: [...collector.suiteStack, name].join(' > '),
    ...(resolvedMode !== 'run' ? { mode: resolvedMode } : {}),
    ...(shouldKeepHandler ? { handler } : {}),
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
      register(context)
    }
  }
  finally {
    globals[ACTIVE_TEST_COLLECTOR_KEY] = previousCollector
  }

  return collector.cases
}
