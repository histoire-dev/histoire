import { createHistoireProject } from '../api/project.js'
import { exitAfterFlush } from '../util/exit.js'

/** Headless visual comparison and explicit baseline update command flags. */
export interface VisualCommandOptions {
  /** Existing Histoire configuration module. */
  'config'?: string
  /** Exact story ID. */
  'story'?: string
  /** Exact variant ID. */
  'variant'?: string
  /** Exact case ID. */
  'case'?: string
  /** Exact profile ID. */
  'profile'?: string
  /** Committed reference rather than working baseline. */
  'baseline-ref'?: string
  /** Skip comparisons whose retained evidence is still valid. */
  'incremental'?: boolean
  /** Explicitly approve successful retained captures. */
  'update'?: boolean
  /** Explicit whole-project update authorization. */
  'all'?: boolean
}

/** Run through managed project ownership; comparisons survive as offline report. */
export async function visualCommand(options: VisualCommandOptions) {
  const abort = new AbortController()
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  /** Interrupt only this command's owned work and retain partial report. */
  const interrupt = () => {
    abort.abort()
    void project?.close().catch(() => {})
  }
  process.once('SIGINT', interrupt)
  try {
    if (options.update && !options.all && !options.story && !options.case && !options.profile) {
      throw new Error('--update requires --case, --story, --profile, or --all')
    }
    if (options.variant && !options.story) {
      throw new Error('--variant requires --story')
    }
    project = await createHistoireProject({ root: process.cwd(), configFile: options.config })
    abort.signal.throwIfAborted()
    const server = await project.startDev({ host: '127.0.0.1', port: 0, open: false, mcp: false, agents: false })
    await server.ready
    const run = await project.visual.run({ storyId: options.story, variantId: options.variant, caseId: options.case, profileId: options.profile, baselineRef: options['baseline-ref'], incremental: options.incremental, signal: abort.signal })
    // Pixel-identical spec changes are approved by the run itself.
    const approved = new Set(run.results.filter(result => result.approved).map(result => result.id))
    if (options.update && run.state === 'completed') {
      const ids = run.results.filter(result => !result.approved && result.currentHash && ['passed', 'changed', 'missing', 'incompatible'].includes(result.status)).map(result => result.id)
      // Transport-size approval limits also bound Node updates; every case is processed.
      for (let index = 0; index < ids.length; index += 256) {
        const receipts = await project.visual.approve({ runId: run.id, resultIds: ids.slice(index, index + 256) })
        for (const receipt of receipts) {
          if (receipt.status === 'approved') {
            approved.add(receipt.resultId)
          }
          else {
            console.error(`${receipt.resultId}: ${receipt.error}`)
          }
        }
      }
    }
    const passed = run.results.filter(result => options.update ? approved.has(result.id) : result.status === 'passed' || result.approved).length
    console.log(`Visual: ${passed}/${run.total} passed${approved.size ? `, ${approved.size} approved` : ''}`)
    if (run.reused) console.log(`Reused: ${run.reused.total}${run.reused.failing ? ` (${run.reused.failing} awaiting review)` : ''}`)
    if (run.results.length) {
      console.log(`Report: ${run.htmlPath}`)
      console.log(`JSON: ${run.reportPath}`)
    }
    for (const result of run.results.filter(result => result.status !== 'passed' && !approved.has(result.id))) {
      console.log(`${result.status}: ${result.case.label} · ${result.spec.id}${result.error ? ` — ${result.error}` : ''}`)
    }
    process.exitCode = abort.signal.aborted ? 130 : passed === run.total && !run.reused?.failing && run.state === 'completed' ? 0 : 1
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'Visual setup failed')
    process.exitCode = abort.signal.aborted ? 130 : 2
  }
  finally {
    try {
      await project?.close()
    }
    catch (error) {
      console.error('Visual runtime cleanup failed', error)
      process.exitCode = abort.signal.aborted ? 130 : 2
    }
    process.removeListener('SIGINT', interrupt)
  }
  await exitAfterFlush()
}
