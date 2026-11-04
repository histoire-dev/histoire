import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runCli } from '@histoire/cli'
import { dirname, resolve } from 'pathe'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { version } = JSON.parse(fs.readFileSync(resolve(__dirname, '../../package.json'), 'utf8'))

process.env.NODE_ENV = 'development'
process.env.HISTOIRE = 'true'

// Argument parsing and the dev parent live in `@histoire/cli`; every
// implementation below loads only when its command runs.
// A rejected action is reported once here instead of surfacing as an unhandled rejection.
Promise.resolve(runCli({
  version,
  dev: () => import('./commands/dev-host.js').then(module => module.devInjection),
  commands: {
    mcp: () => import('./commands/mcp.js').then(module => module.mcpCommand),
    build: () => import('./commands/build.js').then(module => module.buildCommand),
    preview: () => import('./commands/preview.js').then(module => module.previewCommand),
    test: () => import('./commands/test.js').then(module => module.testCommand),
    screenshotSetup: () => import('./commands/screenshot-setup.js').then(module => module.screenshotSetupCommand),
    visual: () => import('./commands/visual.js').then(module => module.visualCommand),
  },
})).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
