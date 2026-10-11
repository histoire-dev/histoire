import type { VisualEvidence } from './recovery.js'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v4'
import { withVisualCacheLock } from './cache-lock.js'
import { listVisualFiles, removeVisualFile, safeVisualRead, safeVisualWrite } from './files.js'
import { readVisualEvidence } from './recovery.js'
import { refreshRecoveredVisualReport } from './report.js'

const markerSchema = z.object({ runId: z.string().uuid(), resultId: z.string().regex(/^[a-f0-9]{64}$/), token: z.string().uuid() })

/** Coalesce derived report work; persisted markers survive crashes and report failures. */
export function createVisualReportQueue(root: string) {
  const pending = new Set<string>()
  const issues = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let draining: Promise<void> | undefined
  let held = 0
  /** Only opaque, validated run IDs enter filesystem paths. */
  function markerPath(runId: string): string {
    if (!z.string().uuid().safeParse(runId).success) throw new Error('Invalid visual report identity')
    return `.histoire/visual/report-dirty/${runId}.json`
  }
  /** Rebuild outside approval locks; clear only marker whose changes were included. */
  async function rebuild(runId: string): Promise<void> {
    const path = markerPath(runId)
    const bytes = await safeVisualRead(root, path, 1024)
    if (!bytes) return
    const marker = markerSchema.parse(JSON.parse(bytes.toString()))
    if (marker.runId !== runId) throw new Error('Invalid visual report marker')
    const evidence = await readVisualEvidence(root, runId, marker.resultId)
    if (!evidence) throw new Error('Visual report evidence missing')
    await refreshRecoveredVisualReport(root, evidence)
    await withVisualCacheLock(root, `report-dirty:${runId}`, async () => {
      const latest = await safeVisualRead(root, path, 1024)
      if (latest?.equals(bytes)) await removeVisualFile(root, path)
      else pending.add(runId)
    })
    issues.delete(runId)
  }
  /** Serialize local bursts; cross-process report writer locks live in report storage. */
  function flush(): Promise<void> {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (draining) return draining
    draining = (async () => {
      while (pending.size) {
        const runId = pending.values().next().value!
        pending.delete(runId)
        try {
          await rebuild(runId)
        }
        catch (error) { issues.set(runId, error instanceof Error ? error.message.slice(0, 256) : 'Visual report update failed') }
      }
    })().finally(() => {
      draining = undefined
      if (pending.size) schedule()
    })
    return draining
  }
  /** Leave response path before scanning any run records. */
  function schedule(): void {
    if (pending.size && !held && !draining) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void flush()
      }, 50)
    }
  }
  return {
    /** Keep one selected approval batch from rebuilding its report between receipts. */
    hold(): () => void {
      held++
      if (timer) clearTimeout(timer)
      timer = undefined
      let released = false
      return () => {
        if (released) return
        released = true
        held--
        schedule()
      }
    },
    /** Small marker is persisted before receipt; report rendering never blocks baseline save. */
    async mark(evidence: VisualEvidence): Promise<void> {
      const runId = evidence.run.id
      await withVisualCacheLock(root, `report-dirty:${runId}`, () => safeVisualWrite(root, markerPath(runId), JSON.stringify({ runId, resultId: evidence.result.id, token: randomUUID() })))
      pending.add(runId)
      schedule()
    },
    /** Restart repairs derived reports independently of capture/review validation. */
    async recover(): Promise<void> {
      for (const name of await listVisualFiles(root, '.histoire/visual/report-dirty')) {
        if (!name.endsWith('.json')) continue
        const runId = name.slice(0, -5)
        if (!z.string().uuid().safeParse(runId).success) continue
        try {
          if (await safeVisualRead(root, markerPath(runId), 1024)) pending.add(runId)
        }
        catch (error) { issues.set(runId, error instanceof Error ? error.message.slice(0, 256) : 'Visual report marker unavailable') }
      }
      schedule()
    },
    flush,
    /** Report failures are distinct from committed baseline approval failures. */
    issues: () => [...issues.values()],
  }
}
