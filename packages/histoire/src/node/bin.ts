import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'
import sade from 'sade'
import { reportInvalidScreenshotSetupArguments, validateScreenshotSetupArguments } from './commands/screenshot-setup-args.js'

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

program.command('screenshot-setup')
  .describe('inspect or explicitly check screenshot browser setup')
  .option('--root <directory>', 'Existing project directory (default current directory)')
  .option('-c, --config <file>', 'Histoire config file relative to project root')
  .option('--check', 'Launch and release one finite screenshot setup probe')
  .option('--json', 'Print one JSON snapshot or error object')
  .action(async (options) => {
    const { screenshotSetupCommand } = await import('./commands/screenshot-setup.js')
    return screenshotSetupCommand(options)
  })

program.command('visual')
  .describe('compare story images and review visual regressions')
  .option('-c, --config <file>', 'Use specified Histoire config file')
  .option('--story <id>', 'Exact story ID')
  .option('--variant <id>', 'Exact variant ID, requires --story')
  .option('--case <id>', 'Exact saved or canonical case ID')
  .option('--profile <id>', 'Exact capture profile ID')
  .option('--baseline-ref <ref>', 'Read baselines from this Git ref')
  .option('--incremental', 'Capture only comparisons without valid retained evidence')
  .option('--update', 'Approve successful selected captures')
  .option('--all', 'Explicitly allow whole-project baseline update')
  .action(async (options) => {
    const { visualCommand } = await import('./commands/visual.js')
    return visualCommand(options)
  })

// Sade exits with status 1 for malformed arguments, so preserve the command's
// documented status 2 for invalid screenshot setup input.
const screenshotSetupInvalid = process.argv[2] === 'screenshot-setup'
  ? validateScreenshotSetupArguments(process.argv.slice(3))
  : undefined
if (screenshotSetupInvalid) {
  reportInvalidScreenshotSetupArguments(process.argv.slice(3).includes('--json'))
  process.exitCode = 2
}
else {
  program.parse(process.argv)
}
