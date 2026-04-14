import { createContext } from '../context.js'
import { ensureBrowserTestDepsInstalled, runHistoireTests } from '../test.js'

export interface TestOptions {
  config?: string
}

export async function testCommand(options: TestOptions, rawVitestArgs: string[] = []) {
  await ensureBrowserTestDepsInstalled()

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
}
