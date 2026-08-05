import { createContext } from '../context.js'
import { runHistoireTests } from '../test/index.js'
import { exitAfterFlush } from '../util/exit.js'

export interface TestOptions {
  config?: string
}

export async function testCommand(options: TestOptions, rawVitestArgs: string[] = []) {
  const ctx = await createContext({
    configFile: options.config,
    mode: 'dev',
  })

  const summary = await runHistoireTests(ctx, {
    rawVitestArgs,
  })

  if (!summary.ok) {
    process.exitCode = 1
  }

  // Never `process.exit()` straight after printing: a piped stdout (CI logs,
  // `| tee`) can still hold buffered writes that would be discarded, truncating
  // the report. Flush it, then let the process end naturally — a timed-out
  // browser/provider cleanup can leave live handles (playwright, ws, vite
  // servers) behind, so a forced exit stays as a last resort.
  await exitAfterFlush()
}
