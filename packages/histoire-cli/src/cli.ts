import type { CliHost } from './commands/host.js'
import sade from 'sade'
import { reportInvalidScreenshotSetupArguments, validateScreenshotSetupArguments } from './commands/screenshot-setup-args.js'

/**
 * Defines every Histoire command and runs the one named on the command line.
 * Command implementations are injected as lazy loaders so `--help` and the dev
 * parent never load project, Vite or test graphs.
 * @param host Version, command loaders and dev parent injection provided by histoire.
 * @returns What the selected command's action returned (a promise for every command), or undefined when no action ran.
 */
export function runCli(host: CliHost): unknown {
  const argv = host.argv ?? process.argv
  const program = sade('histoire')
  program.version(host.version)

  program.command('dev')
    .describe('open the stories in your browser for development')
    .option('-p, --port <port>', 'Listening port of the server')
    .option('-c, --config <file>', `[string] use specified config file`)
    .option('--open', 'Open in your default browser')
    .option('--host <host>', '[string] specify hostname')
    .option('--mcp', 'Enable MCP, overriding project config')
    .option('--no-mcp', 'Disable default-on dev MCP')
    .option('--mcp-port <port>', 'MCP loopback port (default 6007; 0 selects an ephemeral port)')
    .option('--tui', 'Use the interactive terminal panel, overriding CI and inspector detection')
    .option('--no-tui', 'Use plain terminal output')
    .option('--test-watch', 'Run browser tests for affected stories on every change, starting with the whole book')
    .action(async (options) => {
      const argumentsBeforeSeparator = argv.slice(2, !argv.includes('--') ? undefined : argv.indexOf('--'))
      if (argumentsBeforeSeparator.includes('--mcp') && argumentsBeforeSeparator.includes('--no-mcp')) throw new Error('--mcp and --no-mcp cannot be combined')
      const injection = await host.dev()
      const { devCommand } = await import('./commands/dev.js')
      // Sade keeps the option under its CLI spelling.
      const { 'test-watch': testWatch, ...rest } = options
      return devCommand({ ...rest, testWatch: testWatch === true }, { ...injection, version: host.version })
    })

  program.command('mcp')
    .describe('serve Model Context Protocol over stdio')
    .option('--root <directory>', 'Existing project directory (default current directory)')
    .option('-c, --config <file>', '[string] use specified config file relative to project root')
    .action(async options => (await host.commands.mcp())(options))

  program.command('build')
    .describe('build the histoire final app you can deploy')
    .option('-c, --config <file>', `[string] use specified config file`)
    .option('--target <target>', 'Deployment output: static (default) or node')
    .action(async options => (await host.commands.build())(options))

  program.command('preview')
    .describe('preview the built directory')
    .option('-p, --port <port>', 'Listening port of the server')
    .action(async options => (await host.commands.preview())(options))

  program.command('test')
    .describe('run histoire story tests in Vitest browser mode')
    .option('-c, --config <file>', `[string] use specified config file`)
    .action(async (options) => {
      const separatorIndex = argv.indexOf('--')
      const rawVitestArgs = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1)
      return (await host.commands.test())(options, rawVitestArgs)
    })

  program.command('screenshot-setup')
    .describe('inspect or explicitly check screenshot browser setup')
    .option('--root <directory>', 'Existing project directory (default current directory)')
    .option('-c, --config <file>', 'Histoire config file relative to project root')
    .option('--check', 'Launch and release one finite screenshot setup probe')
    .option('--json', 'Print one JSON snapshot or error object')
    .action(async options => (await host.commands.screenshotSetup())(options))

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
    .action(async options => (await host.commands.visual())(options))

  // Sade exits with status 1 for malformed arguments, so preserve the command's
  // documented status 2 for invalid screenshot setup input.
  const screenshotSetupInvalid = argv[2] === 'screenshot-setup'
    ? validateScreenshotSetupArguments(argv.slice(3))
    : undefined
  if (screenshotSetupInvalid) {
    reportInvalidScreenshotSetupArguments(argv.slice(3).includes('--json'))
    process.exitCode = 2
    return undefined
  }
  return program.parse(argv)
}
