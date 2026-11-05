import type { PlannedChange } from '../changes/planner.js'
import { hashConfigCode } from '../../config/codemod/write.js'
import { safeConfigWrite } from '../../config/safe-config-write.js'

/** Executes the exact reviewed source through the shared safe-write transaction. */
export async function writeJobConfig(root: string, file: string, change: PlannedChange, signal: AbortSignal, beforeWrite: () => Promise<void>): Promise<string> {
  if (change.configHash === undefined || change.configCode === undefined) throw new Error('Plugin configuration cannot be edited safely')
  await safeConfigWrite({ root, file, code: change.configCode, expectedHash: change.configHash, isActive: () => !signal.aborted, beforeWrite })
  return hashConfigCode(change.configCode)
}
