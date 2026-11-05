import type { JobState } from '@histoire/shared'
import type { ProjectSnapshot } from './snapshot.js'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { guardProjectPath } from '../../config/codemod/security.js'
import { JobError } from './types.js'

/** Private disk recovery state; never serialized to the browser. */
export interface JobReceipt {
  /** Public bounded job snapshot. */ job: JobState
  /** Receipt retention deadline. */ expires: number
  /** Process owning execution, for crash recovery. */ pid: number
  /** Loaded context that initiated the change; cannot consume its own handoff. */ generation?: string
  /** Exact reviewed config revision expected after commit. */ configHash?: string
  /** Original config revision distinguishes a failed pre-write handoff. */ originalConfigHash?: string
  /** Package rollback bytes, persisted before spawning. */ snapshot?: ProjectSnapshot
  /** Recovery persisted before watched write or package-only restart; successor verifies revision. */ handoff?: boolean
}

/** Returns a guarded marketplace-private directory. */
async function directory(root: string): Promise<string> {
  const folder = await guardProjectPath(path.join(root, '.histoire/marketplace'), root)
  await mkdir(folder, { recursive: true })
  return guardProjectPath(folder, root)
}

/** Writes one private record atomically with session-unique temporary ownership. */
async function atomicRecord(root: string, name: string, data: unknown): Promise<void> {
  const folder = await directory(root)
  const file = await guardProjectPath(path.join(folder, name), root)
  const temporary = path.join(folder, `job-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify(data), { flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
  }
  finally { await rm(temporary, { force: true }) }
}

/** Writes recovery before handing off, retaining a tiny pointer to the latest job. */
export async function writeReceipt(root: string, receipt: JobReceipt): Promise<void> {
  await atomicRecord(root, `job-${receipt.job.jobId}.json`, receipt)
  await atomicRecord(root, 'job.json', { jobId: receipt.job.jobId })
}

/** Reads one bounded private record; callers validate its pointer separately. */
async function readRecord(root: string, jobId: string): Promise<JobReceipt> {
  const file = await guardProjectPath(path.join(root, `.histoire/marketplace/job-${jobId}.json`), root)
  if ((await stat(file)).size > 16 * 1024 * 1024) throw new Error('Job receipt too large')
  const receipt = JSON.parse(await readFile(file, 'utf8')) as JobReceipt
  if (receipt.job?.jobId !== jobId || !Array.isArray(receipt.job.steps) || !Array.isArray(receipt.job.output) || !Number.isFinite(receipt.expires) || !Number.isInteger(receipt.pid)) throw new Error('Invalid job receipt')
  return receipt
}

/** Reads bounded private recovery data, rejecting malformed state instead of executing it. */
export async function readReceipt(root: string): Promise<JobReceipt | undefined> {
  const index = await guardProjectPath(path.join(root, '.histoire/marketplace/job.json'), root)
  try {
    if ((await stat(index)).size > 256) throw new Error('Invalid job receipt pointer')
    const reference = JSON.parse(await readFile(index, 'utf8'))
    if (typeof reference.jobId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(reference.jobId)) throw new Error('Invalid job receipt pointer')
    return await readRecord(root, reference.jobId)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
}

/** Reclaims every expired superseded terminal record, retaining latest and live work. */
export async function sweepReceipts(root: string): Promise<void> {
  const folder = await guardProjectPath(path.join(root, '.histoire/marketplace'), root)
  const latest = await readReceipt(root)
  let names: string[]
  try {
    names = await readdir(folder)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const name of names) {
    const id = /^job-([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.json$/.exec(name)?.[1]
    if (!id || id === latest?.job.jobId) continue
    try {
      const saved = await readRecord(root, id)
      if (saved.expires <= Date.now() && saved.job.status !== 'running') {
        await rm(await guardProjectPath(path.join(folder, name), root), { force: true })
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

/** Checks whether an owning process still exists; EPERM means it is alive. */
export function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}

/** Acquires a cross-process lane before plan verification or any project mutation. */
export async function claimJob(root: string, jobId: string): Promise<void> {
  const file = await guardProjectPath(path.join(await directory(root), 'job.lock'), root)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, JSON.stringify({ jobId, pid: process.pid }), { flag: 'wx', mode: 0o600 })
      return
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const lock = JSON.parse(await readFile(file, 'utf8'))
      if (processAlive(lock.pid)) throw new JobError('busy', 'Another plugin job is running')
      // A crashed owner must be recovered before admitting another write.
      const receipt = await readReceipt(root)
      if (receipt?.job.status === 'running') throw new JobError('busy', 'Recover the interrupted plugin job first')
      await rm(file)
    }
  }
  throw new JobError('failed', 'Could not acquire plugin job')
}

/** Releases only the lane belonging to this exact job, never a successor's lock. */
export async function releaseJob(root: string, jobId: string): Promise<void> {
  const file = await guardProjectPath(path.join(root, '.histoire/marketplace/job.lock'), root)
  try {
    const lock = JSON.parse(await readFile(file, 'utf8'))
    if (lock.jobId === jobId) await rm(file)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

/** Removes an expired terminal receipt without deleting a newer job's state. */
export async function expireReceipt(root: string, jobId: string): Promise<void> {
  const receipt = await readReceipt(root)
  if (receipt?.job.jobId !== jobId || receipt.expires > Date.now()) return
  await rm(await guardProjectPath(path.join(root, `.histoire/marketplace/job-${jobId}.json`), root), { force: true })
  await releaseJob(root, jobId)
}
