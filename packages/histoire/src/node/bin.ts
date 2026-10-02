import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'
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
  .option('-c, --config <file>', `[string] use specified config file`)
  .option('--open', 'Open in your default browser')
  .option('--host <host>', '[string] specify hostname')
  .option('--mcp', 'Enable MCP, overriding project config')
  .option('--no-mcp', 'Disable default-on dev MCP')
  .option('--mcp-port <port>', 'MCP loopback port (default 6007; 0 selects an ephemeral port)')
  .action(async (options) => {
    const argumentsBeforeSeparator = process.argv.slice(2, !process.argv.includes('--') ? undefined : process.argv.indexOf('--'))
    if (argumentsBeforeSeparator.includes('--mcp') && argumentsBeforeSeparator.includes('--no-mcp')) throw new Error('--mcp and --no-mcp cannot be combined')
    const { devCommand } = await import('./commands/dev.js')
    return devCommand(options)
  })

program.command('mcp')
  .describe('serve Model Context Protocol over stdio')
  .option('--root <directory>', 'Existing project directory (default current directory)')
  .option('-c, --config <file>', '[string] use specified config file relative to project root')
  .action(async (options) => {
    const { mcpCommand } = await import('./commands/mcp.js')
    return mcpCommand(options)
  })

program.command('build')
  .describe('build the histoire final app you can deploy')
  .option('-c, --config <file>', `[string] use specified config file`)
  .option('--target <target>', 'Deployment output: static (default) or node')
  .action(async (options) => {
    const { buildCommand } = await import('./commands/build.js')
    return buildCommand(options)
  })

program.command('preview')
  .describe('preview the built directory')
  .option('-p, --port <port>', 'Listening port of the server')
  .action(async (options) => {
    const { previewCommand } = await import('./commands/preview.js')
    return previewCommand(options)
  })

program.command('test')
  .describe('run histoire story tests in Vitest browser mode')
  .option('-c, --config <file>', `[string] use specified config file`)
  .action(async (options) => {
    const separatorIndex = process.argv.indexOf('--')
    const rawVitestArgs = separatorIndex === -1 ? [] : process.argv.slice(separatorIndex + 1)
    const { testCommand } = await import('./commands/test.js')
    return testCommand(options, rawVitestArgs)
  })

program.parse(process.argv)
