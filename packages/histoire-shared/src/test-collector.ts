import type { HistoireTestContext, HistoireTestDefinition, HistoireTestRegistration } from './types/test.js'

export const TEST_REGISTRY_KEY = '__HST_TEST_REGISTRY__'
export const TEST_DEFINITIONS_KEY = '__HST_TEST_DEFINITIONS__'

const ACTIVE_TEST_COLLECTOR_KEY = '__HST_ACTIVE_TEST_COLLECTOR__'

interface HistoireActiveTestCollector {
  cases: HistoireTestDefinition[]
  nextId: number
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

export function registerCollectedTestSuite(_name: string, fn: () => void) {
  const collector = getActiveCollector()
  if (!collector) {
    return
  }

  collector.suiteStack.push(_name)
  try {
    fn()
  }
  finally {
    collector.suiteStack.pop()
  }
}

export function registerCollectedTestCase(name: string, handler?: () => Promise<void> | void) {
  const collector = getActiveCollector()
  if (!collector) {
    return
  }

  collector.cases.push({
    id: String(collector.nextId++),
    name,
    fullName: [...collector.suiteStack, name].join(' > '),
    handler,
  })
}

export function collectHistoireTests(
  registrations: HistoireTestRegistration[],
  context: HistoireTestContext,
) {
  const collector: HistoireActiveTestCollector = {
    cases: [],
    nextId: 0,
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
