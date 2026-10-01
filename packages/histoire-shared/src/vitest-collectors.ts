import type { HistoireTestHandler } from './types/test.js'
import { registerCollectedTestCase, registerCollectedTestSuite } from './test-collector.js'

/** Vitest-like suite function used by Histoire's browser facades. */
export type HistoireSuiteCollector = ((name: string, handler: () => void) => void) & {
  /** Registers a focused suite. */
  only: (name: string, handler: () => void) => void
  /** Registers a skipped suite. */
  skip: (name: string, handler?: () => void) => void
  /** Registers a todo suite. */
  todo: (name: string, handler?: () => void) => void
}

/** Vitest-like test function used by Histoire's browser facades. */
export type HistoireTestCollector = ((name: string, handler?: HistoireTestHandler, timeout?: number) => void) & {
  /** Registers a focused test. */
  only: (name: string, handler?: HistoireTestHandler, timeout?: number) => void
  /** Registers a skipped test. */
  skip: (name: string, handler?: HistoireTestHandler, timeout?: number) => void
  /** Registers a todo test. */
  todo: (name: string, handler?: HistoireTestHandler, timeout?: number) => void
}

/** Creates the shared Vitest-compatible suite collector. */
export function createHistoireSuiteCollector(): HistoireSuiteCollector {
  return Object.assign(
    (name: string, handler: () => void) => registerCollectedTestSuite(name, handler),
    {
      only: (name: string, handler: () => void) => registerCollectedTestSuite(name, handler, 'only'),
      skip: (name: string, handler?: () => void) => registerCollectedTestSuite(name, handler, 'skip'),
      todo: (name: string, handler?: () => void) => registerCollectedTestSuite(name, handler, 'todo'),
    },
  )
}

/** Creates the shared Vitest-compatible test collector. */
export function createHistoireTestCollector(): HistoireTestCollector {
  return Object.assign(
    (name: string, handler?: HistoireTestHandler, timeout?: number) => registerCollectedTestCase(name, handler, timeout),
    {
      only: (name: string, handler?: HistoireTestHandler, timeout?: number) => registerCollectedTestCase(name, handler, timeout, 'only'),
      skip: (name: string, handler?: HistoireTestHandler, timeout?: number) => registerCollectedTestCase(name, handler, timeout, 'skip'),
      todo: (name: string, handler?: HistoireTestHandler, timeout?: number) => registerCollectedTestCase(name, handler, timeout, 'todo'),
    },
  )
}
