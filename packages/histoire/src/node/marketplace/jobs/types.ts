import type { JobState, MarketplaceError } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { HostRestart } from '../../runtime/host-restart.js'
import type { createPlanStore } from '../changes/plan-store.js'

/** Captured generation and external process environment for the real job engine. */
export interface JobRunnerOptions {
  /** Project root and per-project exclusion key. */ root: string
  /** Existing standalone config destination. */ configFile: string
  /** Generation-owned reviewed plan capabilities. */ plans: ReturnType<typeof createPlanStore>
  /** Loaded context, used only for successor confirmation and required-plugin protection. */ context?: Context
  /** Package-manager environment; inherits production environment by default. */ env?: NodeJS.ProcessEnv
  /** Replaces the runtime process after the change; absent for in-process runtimes. */ restart?: HostRestart
}
/** Transport-safe job admission/cancellation rejection. */
export class JobError extends Error {
  /** Public error classification, including busy. */ code: MarketplaceError['code']

  /** Associates a bounded message with a channel error code. */
  constructor(code: MarketplaceError['code'], message: string) {
    super(message)
    this.code = code
  }
}
/** Detached public snapshots prevent consumers from mutating engine state. */
export function copyJob(job: JobState): JobState {
  return structuredClone(job)
}
