import fs from 'fs'
import { dirname, resolve } from 'pathe'
import { fileURLToPath } from 'url'
import sade from 'sade'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { version } = JSON.parse(fs.readFileSync(resolve(__dirname, '../../package.json'), 'utf8'))

const program = sade('histoire')
program.version(version)

program.command('dev')
  .describe('open the stories in your browser for development')
  .option('-p, --port <port>', 'Listening port of the server')
  .action(async (options) => {
    const { dev } = await import('./commands/dev.js')
    return dev(options)
  })

program.parse(process.argv)
