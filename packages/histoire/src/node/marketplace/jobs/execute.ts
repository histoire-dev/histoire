import type { JobState, JobStepId } from '@histoire/shared'
import type { PlannedChange } from '../changes/planner.js'
import type { RepairReceipt } from './repair.js'
import type { JobRunnerOptions } from './types.js'
import path from 'pathe'
import { configFileHash, hashConfigCode } from '../../config/codemod/write.js'
import { SafeConfigWriteError } from '../../config/safe-config-write.js'
import { officialPlugins } from '../catalog/official.js'
import { writeJobConfig } from './config-step.js'
import { parseFailure, suggestVersion } from './failure.js'
import { createJobOutput } from './output.js'
import { findUnmetPeer, PeerConflictError } from './peers.js'
import { readReceipt, releaseJob, writeReceipt } from './receipt.js'
import { repairDependencies } from './repair.js'
import { restoreProject, snapshotProject } from './snapshot.js'
import { spawnPackage } from './spawn.js'
import { copyJob } from './types.js'

/** Past-tense verbs for the host's restart notice. */
const restartVerbs: Record<JobState['kind'], string> = { install: 'Installed', remove: 'Removed', update: 'Updated', pin: 'Pinned', options: 'Configured' }

/**
 * Labels the host restart with the change that caused it.
 * @param job Running job.
 */
function restartSource(job: JobState): string {
  return `${restartVerbs[job.kind]} ${job.id}`
}

/** Runs a claimed job through actual filesystem and child-process boundaries. */
export async function executeJob(options: JobRunnerOptions, receipt: RepairReceipt, change: PlannedChange, binary: string | undefined, abort: AbortController, changed: () => void, waitForContinue: () => Promise<void>, beginRepair: () => AbortSignal): Promise<void> {
  const job = receipt.job
  const environment = { ...process.env, ...options.env }
  let active: JobStepId = 'resolve'
  let configCommitted = false
  let packageStarted = false
  const outputs = [createJobOutput(job.output, changed), createJobOutput(job.output, changed)]
  /** Keeps each stream's partial lines private until sanitization can inspect a full URL. */
  function writeOutput(text: string, stream: 'stdout' | 'stderr') {
    outputs[stream === 'stdout' ? 0 : 1].write(text)
  }
  /** Flushes both bounded stream tails after process output has closed. */
  function finishOutput() {
    for (const output of outputs) output.finish()
  }
  /** Records ordered step transitions with elapsed execution evidence. */
  async function step(id: JobStepId, operation: () => Promise<void>) {
    active = id
    const entry = job.steps.find(step => step.id === id)!
    entry.state = 'running'
    const start = Date.now()
    changed()
    await operation()
    entry.state = 'done'
    entry.ms = Date.now() - start
    changed()
  }
  /** Publishes a terminal snapshot only after durable recovery and lane release finish. */
  async function terminal(next: JobState) {
    const latest = await readReceipt(options.root)
    // A successor may already have completed load or admitted another job.
    if (latest && (latest.job.jobId !== job.jobId || latest.job.status !== 'running')) return
    await writeReceipt(options.root, { ...receipt, job: next })
    await releaseJob(options.root, job.jobId)
    delete job.awaiting
    Object.assign(job, next)
    changed()
  }
  try {
    await step('resolve', async () => {
      abort.signal.throwIfAborted()
    })
    receipt.snapshot = await snapshotProject(options.root)
    await writeReceipt(options.root, receipt)
    if (change.plan.command && binary) {
      await step('install', async () => {
        packageStarted = true
        await spawnPackage([binary, ...change.plan.command!.argv.slice(1)], options.root, abort.signal, writeOutput, environment)
        if (change.request.kind === 'remove') return
        const unmet = await findUnmetPeer(options.root, job.id)
        if (!unmet) return
        const error = new PeerConflictError(unmet)
        writeOutput(`${error.message}\n`, 'stderr')
        throw error
      })
      finishOutput()
    }
    else {
      job.steps.find(step => step.id === 'install')!.state = 'skipped'
    }
    abort.signal.throwIfAborted()
    const configChanged = change.configCode !== undefined && hashConfigCode(change.configCode) !== change.configHash
    const host = options.restart
    // Ask mode holds before the first restart trigger: the watched config write, or the host restart.
    if ((configChanged || host) && change.request.prefs.afterInstall === 'ask') {
      await writeReceipt(options.root, { ...receipt, job: { ...job, awaiting: 'continue' } })
      // Expose confirmation only once its durable state and resume handler exist.
      job.awaiting = 'continue'
      const confirmation = waitForContinue()
      changed()
      await confirmation
      abort.signal.throwIfAborted()
    }
    receipt.configHash = hashConfigCode(change.configCode!)
    receipt.originalConfigHash = change.configHash
    receipt.expires = Date.now() + 10 * 60_000
    const restart = job.steps.find(step => step.id === 'restart')!
    if (configChanged) {
      await step('config', async () => {
        await writeJobConfig(options.root, options.configFile, change, abort.signal, async () => {
          // The watcher can retire this process immediately after the atomic write.
          // Save handoff first; successor must prove the exact loaded revision.
          receipt.handoff = true
          restart.state = 'running'
          await writeReceipt(options.root, receipt)
        })
        configCommitted = true
      })
    }
    else {
      job.steps.find(step => step.id === 'config')!.state = 'skipped'
    }
    receipt.handoff = true
    // A host replaces the whole process, so the successor loads updated plugin code; the
    // config watcher alone may reload in-process with modules still cached.
    if (host) {
      restart.state = 'running'
      await writeReceipt(options.root, receipt)
      if (host({ source: restartSource(job), fresh: Boolean(change.plan.command) })) {
        changed()
        return
      }
    }
    if (!configChanged) {
      // Without a host (or a reachable one), only the user can restart the dev server.
      restart.state = 'pending'
      job.awaiting = 'restart'
      await writeReceipt(options.root, receipt)
    }
    changed()
  }
  catch (error) {
    finishOutput()
    const cancelled = abort.signal.aborted
    const repairSignal = beginRepair()
    // A successful manager exit with rejected peers carries its own evidence.
    const failure = error instanceof PeerConflictError
      ? { code: 'peer-conflict' as const, message: 'Package peer dependencies conflict', peer: error.unmet.peer, found: error.unmet.found }
      : parseFailure(job.output.join('\n'))
    const configFailure = (active as JobStepId) === 'config'
    let configRestored = !configCommitted
    let restored = configRestored
    const leftovers: string[] = []
    if (configFailure) {
      configRestored = error instanceof SafeConfigWriteError ? error.restored : await configFileHash(options.configFile, { root: options.root }).catch(() => undefined) === change.configHash
      restored = configRestored
    }
    if (receipt.snapshot) {
      const recovery = packageStarted && binary
        ? await repairDependencies({ root: options.root, snapshot: receipt.snapshot, request: change.request, manager: change.plan.packageManager.name, argv: change.plan.command!.argv, binary, version: receipt.installedVersion, signal: repairSignal, output: writeOutput, environment })
        : { restored: true, leftovers: await restoreProject(receipt.snapshot) }
      restored &&= recovery.restored && !recovery.leftovers.length
      leftovers.push(...recovery.leftovers)
      finishOutput()
    }
    if (!configRestored && configFailure) leftovers.push(path.relative(options.root, options.configFile))
    const wasCancelled = cancelled || repairSignal.aborted
    const suggestion = !wasCancelled && failure.code === 'peer-conflict' && (change.request.prefs.community || officialPlugins.some(entry => entry.id === job.id && entry.official))
      ? await suggestVersion(options.root, job.id, failure)
      : undefined
    const failed = copyJob(job)
    failed.failure = { code: configFailure ? 'config-write' : failure.code, message: wasCancelled ? 'Plugin change cancelled' : configFailure ? 'Plugin configuration could not be saved. Run the change manually.' : failure.message, restored, leftovers: [...new Set(leftovers)], ...(suggestion ? { suggestion } : {}) }
    delete failed.awaiting
    failed.status = wasCancelled ? 'cancelled' : 'failed'
    failed.steps.find(step => step.id === active)!.state = 'failed'
    for (const entry of failed.steps) {
      if (entry.state === 'pending') entry.state = 'skipped'
    }
    receipt.expires = Date.now() + 10 * 60_000
    await terminal(failed)
  }
}
