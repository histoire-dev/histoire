import type { ScreenshotSetupCommand } from './types/screenshot-setup.js'

/** Canonical finite process signal names permitted in portable setup diagnostics. */
export const SCREENSHOT_SETUP_SIGNALS = [
  'SIGABRT',
  'SIGALRM',
  'SIGBREAK',
  'SIGBUS',
  'SIGCHLD',
  'SIGCONT',
  'SIGFPE',
  'SIGHUP',
  'SIGILL',
  'SIGINFO',
  'SIGINT',
  'SIGIO',
  'SIGKILL',
  'SIGLOST',
  'SIGPIPE',
  'SIGPOLL',
  'SIGPROF',
  'SIGPWR',
  'SIGQUIT',
  'SIGSEGV',
  'SIGSTKFLT',
  'SIGSTOP',
  'SIGSYS',
  'SIGTERM',
  'SIGTRAP',
  'SIGTSTP',
  'SIGTTIN',
  'SIGTTOU',
  'SIGUNUSED',
  'SIGURG',
  'SIGUSR1',
  'SIGUSR2',
  'SIGVTALRM',
  'SIGWINCH',
  'SIGXCPU',
  'SIGXFSZ',
] as const

/** Canonical commands permitted in screenshot setup repair DTOs. */
const COMMANDS = {
  playwright: ['pnpm', 'add', '-D', 'playwright'],
  playwrightUpgrade: ['pnpm', 'add', '-D', 'playwright@latest'],
  playwrightCoreUpgrade: ['pnpm', 'add', '-D', 'playwright-core@latest'],
  playwrightShell: ['pnpm', 'exec', 'playwright', 'install', 'chromium', '--only-shell'],
  playwrightCoreShell: ['pnpm', 'exec', 'playwright-core', 'install', 'chromium', '--only-shell'],
  playwrightSystemDependencies: ['pnpm', 'exec', 'playwright', 'install-deps', 'chromium'],
  playwrightCoreSystemDependencies: ['pnpm', 'exec', 'playwright-core', 'install-deps', 'chromium'],
  playwrightFullChromium: ['pnpm', 'exec', 'playwright', 'install', 'chromium', '--no-shell'],
  playwrightCoreFullChromium: ['pnpm', 'exec', 'playwright-core', 'install', 'chromium', '--no-shell'],
} as const

/** Static repair command key shared by the Node reporter and UI serializer. */
export type ScreenshotSetupCommandKey = keyof typeof COMMANDS

/** Returns a detached canonical command specification by fixed repair key. */
export function getScreenshotSetupCommand(key: ScreenshotSetupCommandKey): ScreenshotSetupCommand {
  const [executable, ...args] = COMMANDS[key]
  return { executable, args }
}

/** Serializes one fixed repair command for safe display or clipboard copy. */
export function serializeScreenshotSetupCommand(command: ScreenshotSetupCommand): string {
  const tokens = [command.executable, ...command.args]
  if (!Object.values(COMMANDS).some(allowed => allowed.length === tokens.length && allowed.every((token, index) => token === tokens[index]))) {
    throw new TypeError('Screenshot setup command is not allowlisted')
  }
  return tokens.map(quotePosixToken).join(' ')
}

/** Quotes a single POSIX shell token without interpreting it as command text. */
function quotePosixToken(token: string): string {
  if (/^[\w./:@+-]+$/.test(token)) return token
  return `'${token.replaceAll('\'', '\'\\\'\'')}'`
}
