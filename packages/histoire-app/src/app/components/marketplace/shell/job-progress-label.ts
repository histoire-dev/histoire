import type { JobState, JobStepId } from '@histoire/shared'

/**
 * Describe current server work consistently across marketplace surfaces.
 * @param job Server-owned receipt, when admitted.
 * @param step Explicit progress-list step; omitted for current activity text.
 */
export function jobProgressLabel(job: JobState | undefined, step?: JobStepId): string {
  if (!step) {
    if (job?.awaiting === 'restart') return 'Restart the dev server to finish'
    if (job?.awaiting) return 'Restart required'
    if (job?.status === 'cancelled') return `${job.kind === 'update' ? 'Update' : 'Install'} cancelled`
  }
  const labels = {
    /** Package metadata resolution. */ resolve: step ? `Resolved ${job?.id}@${job?.version}` : 'Resolving plugin',
    /** Package manager execution. */ install: step ? 'Installed package' : 'Installing package',
    /** Guarded config write. */ config: step ? 'Updated histoire.config.ts' : 'Updating histoire.config.ts',
    /** Dev proxy replaces its runtime. */ restart: 'Restarting dev server',
    /** Successor confirms plugin load. */ load: 'Loading plugin',
  }
  return labels[step ?? job?.steps.find(step => step.state === 'running')?.id ?? 'resolve']
}
