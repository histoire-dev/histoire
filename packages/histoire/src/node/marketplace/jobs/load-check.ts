import type { JobState } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { JobReceipt } from './receipt.js'
import { configFileHash } from '../../config/codemod/write.js'
import { getInstalledIndex } from '../inventory/index.js'

/** Confirms effective package identity/version and resolved workbench entries in a successor. */
export async function completeLoad(ctx: Context, file: string, receipt: JobReceipt): Promise<JobState> {
  const job = structuredClone(receipt.job)
  const row = ctx.pluginInventory?.find(row => row.packageName === job.id)
  const installed = getInstalledIndex(ctx).get(job.id)
  const removed = job.kind === 'remove'
  const revision = await configFileHash(file, { root: ctx.root })
  const entry = row?.id && ctx.workbenchPlugins?.find(plugin => plugin.id === row.id)
  const valid = revision === receipt.configHash && (removed ? !installed?.enabled : installed?.enabled && installed.version === job.version && (!row?.client || (entry && entry.client)) && (!row?.frame || (entry && entry.frame)))
  for (const step of job.steps) {
    if (step.id === 'config' && step.state !== 'skipped') step.state = 'done'
    if (step.id === 'restart') step.state = 'done'
    if (step.id === 'load') step.state = valid ? 'done' : 'failed'
  }
  delete job.awaiting
  job.status = valid ? 'succeeded' : 'failed'
  if (valid) {
    // Browser contribution registrations are not reported by the Node descriptor.
    // Never present manifest promises or search commands as observed contributions.
    job.contributions = []
  }
  else {
    job.failure = { code: 'load', message: 'Saved plugin changes are not effective. Check the config and server output.', restored: false, leftovers: ['package.json', file, 'node_modules'] }
  }
  return job
}
