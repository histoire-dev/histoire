import type { ChangePlan, ChangeRequest, JobState, MarketplacePrefs } from '@histoire/shared'
import type { Ref, ShallowRef } from 'vue'
import type { marketplaceClient } from '../../../util/marketplace-client.js'
import type { ReviewedJob } from './marketplace-jobs.js'

/** Workbench-owned authority consumed by background marketplace services. */
export interface MarketplaceServiceOwner {
  /** Shared channel client. */ client: typeof marketplaceClient
  /** Current preferences. */ prefs: Ref<MarketplacePrefs>
  /** Latest server receipt. */ job: ShallowRef<JobState | undefined>
  /** Reviewed intent retained through restart. */ reviewedJob: Readonly<ShallowRef<ReviewedJob | undefined>>
  /** Restart transport feedback. */ restartError: Ref<string | undefined>
  /** Admit reviewed work. */ startJob: (planId: string, hash: string, request: ChangeRequest) => Promise<JobState>
  /** Resume held work. */ restartJob: (job?: JobState) => Promise<boolean>
  /** Display failure or manual instructions. */ startInstall: (request: ChangeRequest, manualPlan?: ChangePlan) => void
  /** Review breaking updates. */ openUpdate: (id: string) => void
}
