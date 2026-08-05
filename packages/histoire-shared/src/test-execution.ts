import type { HistoireTestRegistration } from './types/test.js'

/** Id of the story-setup execution currently running, if any. */
const CURRENT_EXECUTION_KEY = '__HST_STORY_EXECUTION__'
/** Monotonic source of execution ids. */
const EXECUTION_COUNTER_KEY = '__HST_STORY_EXECUTION_COUNTER__'
/** Maps a registration to the execution that produced it. */
const EXECUTION_BY_REGISTRATION_KEY = '__HST_STORY_EXECUTION_BY_REGISTRATION__'

/**
 * The tracking state lives on `globalThis` rather than in module scope on
 * purpose: `@histoire/shared` is loaded once by the story graph (through
 * `histoire/client`) and again by the support plugin bundles, and both copies
 * must agree on execution ids for the tagging to be usable.
 */
interface HistoireExecutionGlobals {
  [CURRENT_EXECUTION_KEY]?: number
  [EXECUTION_COUNTER_KEY]?: number
  [EXECUTION_BY_REGISTRATION_KEY]?: WeakMap<HistoireTestRegistration, number>
}

function getGlobals() {
  return globalThis as typeof globalThis & HistoireExecutionGlobals
}

function getRegistrationExecutions() {
  const globals = getGlobals()
  return globals[EXECUTION_BY_REGISTRATION_KEY] ??= new WeakMap()
}

/**
 * Marks `fn` as one execution of a story's setup code.
 *
 * Support plugins wrap the SYNCHRONOUS part of their story mount with this, so
 * every `onTest(...)` a story emits while setting up is attributed to the mount
 * that caused it. Without it, concurrent mounts of the same story (the preview
 * iframe renders its own live copy while a test session mounts two more) are
 * indistinguishable, because they all push into the same ambient registry.
 * @param fn The story mount to run as a single execution.
 * @returns Whatever `fn` returns.
 */
export function withStoryExecution<T>(fn: () => T): T {
  const globals = getGlobals()
  const previous = globals[CURRENT_EXECUTION_KEY]
  globals[EXECUTION_COUNTER_KEY] = (globals[EXECUTION_COUNTER_KEY] ?? 0) + 1
  globals[CURRENT_EXECUTION_KEY] = globals[EXECUTION_COUNTER_KEY]

  try {
    return fn()
  }
  finally {
    globals[CURRENT_EXECUTION_KEY] = previous
  }
}

/**
 * Attributes `register` to the story-setup execution running right now.
 *
 * Called by `pushHistoireTestRegistration`; a no-op outside any execution (a
 * module-scope `onTest(...)`, or a support plugin that does not mark its
 * mounts), which leaves the registration untagged.
 * @param register The registration being pushed to the ambient registry.
 */
export function tagStoryExecution(register: HistoireTestRegistration) {
  const executionId = getGlobals()[CURRENT_EXECUTION_KEY]
  if (executionId === undefined) {
    return
  }

  getRegistrationExecutions().set(register, executionId)
}

/**
 * Returns the id of the story-setup execution that emitted `register`.
 * @param register A registration captured from the ambient registry.
 * @returns The execution id, or `undefined` when the registration is untagged.
 */
export function getStoryExecutionId(register: HistoireTestRegistration) {
  return getRegistrationExecutions().get(register)
}

/**
 * Reads the monotonic execution counter, so a caller can tell which executions
 * started after a given point.
 */
export function getStoryExecutionCounter() {
  return getGlobals()[EXECUTION_COUNTER_KEY] ?? 0
}

/**
 * Ids of the story-setup executions started since the counter had the given
 * value.
 *
 * Callers read the counter right before running a mount synchronously: nothing
 * else can execute in between, so every id created in that window belongs to
 * that mount — which is how a test session tells its own story executions apart
 * from the concurrent ones landing in the same ambient registry (the preview
 * iframe rendering its own live copy of the story).
 * @param counter Value read before the mount.
 */
export function getStoryExecutionsSince(counter: number) {
  const ids = new Set<number>()

  for (let id = counter + 1; id <= getStoryExecutionCounter(); id++) {
    ids.add(id)
  }

  return ids
}
