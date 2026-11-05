import type { JobState } from '@histoire/shared'
import type { RepairReceipt } from './repair.js'
import type { JobRunnerOptions } from './types.js'
import { randomUUID } from 'node:crypto'
import { configFileHash } from '../../config/codemod/write.js'
import { getConfigDependencies } from '../../config/dependencies.js'
import { hasManagedConfigInput } from '../changes/config-inputs.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'
import { executeJob } from './execute.js'
import { completeLoad } from './load-check.js'
import { claimJob, expireReceipt, processAlive, readReceipt, releaseJob, sweepReceipts, writeReceipt } from './receipt.js'
import { resolveBinary } from './spawn.js'
import { copyJob, JobError } from './types.js'

/** Stable identity prevents another engine on the same loaded context consuming its handoff. */
const generations = new WeakMap<object, string>()

/** In-process admission closes the async disk-claim race across generation-local runners. */
const lanes = new Map<string, { jobId: string }>()

/** Creates a server-owned project lane; browser disconnection never cancels it. */
export function createJobRunner(options: JobRunnerOptions) {
  const generation = options.context ? generations.get(options.context) ?? randomUUID() : randomUUID()
  if (options.context) generations.set(options.context, generation)
  const listeners = new Set<(job: JobState) => void>()
  const owner = { jobId: '' }
  let current: JobState | undefined
  let receipt: RepairReceipt | undefined
  let abort: AbortController | undefined
  let repairing = false
  let work: Promise<void> | undefined
  let completing: Promise<JobState | null> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = 0
  let resume: (() => void) | undefined
  /** Gives rollback a fresh signal; another cancellation can stop its process. */
  function beginRepair(): AbortSignal {
    repairing = true
    abort = new AbortController()
    return abort.signal
  }
  /** Holds only the config write; cancellation wakes execution so rollback can finish. */
  function waitForContinue(): Promise<void> {
    return new Promise((resolve, reject) => {
      const signal = abort!.signal
      /** Releases confirmation listener on either accepted continuation or cancellation. */
      function finish() {
        signal.removeEventListener('abort', cancelled)
        resume = undefined
      }
      /** Rejects held execution through the ordinary rollback path. */
      function cancelled() {
        finish()
        reject(signal.reason)
      }
      resume = () => {
        finish()
        resolve()
      }
      signal.addEventListener('abort', cancelled, { once: true })
      if (signal.aborted) cancelled()
    })
  }
  /** Throttles broadcasts only; state and rollback continue without clients. */
  function publish() {
    clearTimeout(timer)
    timer = undefined
    last = Date.now()
    if (current) {
      for (const listener of listeners) {
        try {
          listener(copyJob(current))
        }
        catch { /* A disconnected observer cannot fail the project transaction. */ }
      }
    }
  }
  /** Coalesces progress/output updates to at most ten broadcasts per second. */
  function changed() {
    if ((current?.status === 'failed' || current?.status === 'cancelled') && lanes.get(options.root) === owner) lanes.delete(options.root)
    if (timer) return
    timer = setTimeout(publish, Math.max(0, 100 - (Date.now() - last)))
    timer.unref?.()
  }
  /** Reconciles durable handoff only from a distinct engine with a loaded successor. */
  async function recover(): Promise<JobState | null> {
    await sweepReceipts(options.root)
    if (current && receipt && receipt.expires <= Date.now() && current.status !== 'running') {
      await expireReceipt(options.root, current.jobId)
      if (lanes.get(options.root) === owner) lanes.delete(options.root)
      current = undefined
      receipt = undefined
      return null
    }
    if (current) return copyJob(current)
    const saved = await readReceipt(options.root)
    if (!saved) return null
    const pendingRestart = saved.job.steps.some(step => step.id === 'restart' && ['pending', 'running'].includes(step.state))
    if (saved.expires <= Date.now() && saved.job.status !== 'running') {
      await expireReceipt(options.root, saved.job.jobId)
      if (lanes.get(options.root)?.jobId === saved.job.jobId) lanes.delete(options.root)
      return null
    }
    if (saved.job.status === 'running' || pendingRestart) {
      const revision = await configFileHash(options.configFile, { root: options.root })
      const committed = saved.configHash && saved.configHash === revision
      const loadedRevision = options.context?.pluginToggle?.hash
      if (saved.configHash && options.context && saved.generation !== generation && (saved.handoff || !processAlive(saved.pid)) && (!loadedRevision || loadedRevision === revision)) {
        saved.job = await completeLoad(options.context, options.configFile, saved)
      }
      else if (!processAlive(saved.pid) || saved.expires <= Date.now()) {
        // A crashed detached package-manager tree may still be running. Do not
        // restore underneath unknown live writers; retain snapshot for recovery.
        const leftovers = ['package.json', 'node_modules', ...(revision !== saved.originalConfigHash ? [options.configFile] : [])]
        saved.job.status = 'failed'
        delete saved.job.awaiting
        const active = saved.job.steps.find(step => step.state === 'running') ?? saved.job.steps.find(step => step.id === 'load')!
        active.state = 'failed'
        saved.job.failure = { code: committed ? 'load' : 'unknown', message: 'Plugin job was interrupted. Check project files before retrying.', restored: false, leftovers: [...new Set([...leftovers, 'node_modules'])] }
      }
      else {
        return copyJob(saved.job)
      }
      saved.expires = Date.now() + 10 * 60_000
      await writeReceipt(options.root, saved)
      await releaseJob(options.root, saved.job.jobId)
      if (lanes.get(options.root)?.jobId === saved.job.jobId) lanes.delete(options.root)
    }
    current = saved.job
    receipt = saved
    changed()
    return copyJob(current)
  }
  return {
    /** Claims the project, freshly verifies the reviewed plan, then starts background work. */
    async start(planId: string, hash: string): Promise<JobState> {
      if (lanes.has(options.root)) throw new JobError('busy', 'Another plugin job is running')
      const jobId = randomUUID()
      owner.jobId = jobId
      lanes.set(options.root, owner)
      let claimed = false
      try {
        await claimJob(options.root, jobId)
        claimed = true
        const change = await options.plans.verifyPlan(planId, hash)
        if (change.request.kind === 'remove' && options.context?.pluginInventory?.some(row => row.packageName === change.request.id && row.required)) throw new JobError('invalid', 'Required plugins cannot be removed')
        const dependencies = getConfigDependencies(options.context?.config)
        const watched = [...dependencies?.histoire.keys() ?? [], ...dependencies?.vite.keys() ?? []]
        if (await hasManagedConfigInput(options.configFile, watched)) throw new JobError('unavailable', 'Package files are config inputs. Run the change manually.')
        const binary = change.plan.command
          ? await resolveBinary(change.plan.packageManager.name, { ...process.env, ...options.env }).catch(() => {
            throw new JobError('unavailable', 'Package manager unavailable. Run the reviewed command manually.')
          })
          : undefined
        const installed = binary ? await readInstalledPackage(options.root, change.request.id) : undefined
        current = { jobId, kind: change.request.kind, id: change.request.id, version: change.request.version!, status: 'running', steps: ['resolve', 'install', 'config', 'restart', 'load'].map(id => ({ id: id as JobState['steps'][number]['id'], state: 'pending' })), output: [] }
        receipt = { installedVersion: typeof installed?.version === 'string' ? installed.version : undefined, job: current, expires: Number.MAX_SAFE_INTEGER, pid: process.pid, generation, originalConfigHash: change.configHash }
        repairing = false
        abort = new AbortController()
        await writeReceipt(options.root, receipt)
        work = executeJob(options, receipt, change, binary, abort, changed, waitForContinue, beginRepair).catch(async () => {
          // Persistence/rollback IO failures must never turn into an unhandled rejection
          // or be announced as restored. Preserve exclusion until manual recovery.
          current!.status = 'failed'
          delete current!.awaiting
          current!.failure = { code: 'unknown', message: 'Plugin job recovery failed. Check project files and server output.', restored: false, leftovers: ['package.json', 'node_modules', options.configFile] }
        }).finally(() => {
          if (current?.status === 'failed' || current?.status === 'cancelled') {
            if (lanes.get(options.root) === owner) lanes.delete(options.root)
          }
          publish()
        })
        changed()
        return copyJob(current)
      }
      catch (error) {
        if (claimed) await releaseJob(options.root, jobId)
        if (lanes.get(options.root) === owner) lanes.delete(options.root)
        throw error
      }
    },
    /** Reads latest state, completing disk receipts against a loaded successor. */
    current(): Promise<JobState | null> {
      return completing ??= recover().finally(() => {
        completing = undefined
      })
    },
    /** Resumes exactly one user-confirmed config write owned by this generation. */
    async continue(jobId: string): Promise<void> {
      if (!current || current.jobId !== jobId || current.awaiting !== 'continue' || !resume) throw new JobError('invalid', 'Plugin job is not awaiting confirmation')
      delete current.awaiting
      resume()
    },
    /** Cancels only cancellable work and returns after process tree and restoration settle. */
    async cancel(jobId: string): Promise<void> {
      if (!current || current.jobId !== jobId) throw new JobError('invalid', 'Plugin job is not owned by this runtime')
      if (current.status !== 'running') return
      if (!repairing && current.steps.some(step => step.id === 'config' && step.state !== 'pending')) throw new JobError('unavailable', 'Plugin config is being saved. Wait for the restart.')
      abort?.abort(new Error('Plugin job cancelled'))
      await work
    },
    /** Joins finite execution through handoff; successor load confirmation is separate. */
    async wait(): Promise<void> { await work },
    /** Attaches progress without acquiring execution ownership. */
    subscribe(listener: (job: JobState) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
