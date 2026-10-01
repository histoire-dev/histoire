import type { HistoireTestDefinition } from '@histoire/shared'
import { registerHistoireTestTaskCallback } from '@histoire/shared'

/** Tasks currently executing Histoire-collected story definitions. */
const histoireTasks = new WeakSet<object>()
/** Preview tasks report failures directly from their compatible task result. */
const previewTasks = new WeakSet<object>()

/** Marks a real Vitest task so nested lifecycle code can identify it safely. */
export function enterHistoireTestTask(task: unknown) {
  if (!task || typeof task !== 'object') {
    return () => {}
  }

  histoireTasks.add(task)
  return () => histoireTasks.delete(task)
}

/** Checks whether this task belongs to Histoire's embedded lifecycle. */
export function isHistoireTestTask(task: unknown) {
  return !!task && typeof task === 'object' && histoireTasks.has(task)
}

/** Creates the task and shared TestContext supplied to embedded callbacks. */
export function createPreviewTestTask(definition: HistoireTestDefinition, id: string, filepath: string) {
  const task = {
    id,
    type: 'test',
    name: definition.name,
    fullTestName: definition.fullName,
    file: { filepath },
    meta: {},
    result: { state: 'run', errors: [] as unknown[] },
    onFailed: [] as ((context: any) => unknown)[],
    onFinished: [] as ((context: any) => unknown)[],
    context: {} as any,
    promises: [] as Promise<unknown>[],
  }
  task.context = {
    task,
    expect: (globalThis as any)[Symbol.for('expect-global')],
    onTestFailed: (callback: (context: any) => unknown, timeout?: number) => registerHistoireTestTaskCallback(task, 'onFailed', callback, timeout),
    onTestFinished: (callback: (context: any) => unknown, timeout?: number) => registerHistoireTestTaskCallback(task, 'onFinished', callback, timeout),
  }
  histoireTasks.add(task)
  previewTasks.add(task)
  return task
}

/** Distinguishes tasks whose errors are read directly by the preview UI. */
export function isPreviewTestTask(task: object) {
  return previewTasks.has(task)
}
