import fs from 'node:fs'
import { dirname, resolve } from 'pathe'
import { fileURLToPath } from 'node:url'
import sade from 'sade'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { version } = JSON.parse(fs.readFileSync(resolve(__dirname, '../../package.json'), 'utf8'))

process.env.NODE_ENV = 'development'
process.env.HISTOIRE = 'true'

const program = sade('histoire')
program.version(version)

program.command('dev')
  .describe('open the stories in your browser for development')
  .option('-p, --port <port>', 'Listening port of the server')
  .option('--open', 'Open in your default browser')
  .action(async (options) => {
    const { devCommand } = await import('./commands/dev.js')
    return devCommand(options)
  })

program.command('build')
  .describe('build the histoire final app you can deploy')
  .action(async () => {
    const { buildCommand } = await import('./commands/build.js')
    return buildCommand()
  })

program.command('preview')
  .describe('preview the built directory')
  .option('-p, --port <port>', 'Listening port of the server')
  .action(async (options) => {
    const { previewCommand } = await import('./commands/preview.js')
    return previewCommand(options)
  })

program.parse(process.argv)
