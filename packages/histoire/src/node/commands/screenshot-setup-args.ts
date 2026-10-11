/** Validate setup-specific arguments before Sade can choose its generic exit code. */
export function validateScreenshotSetupArguments(args: readonly string[]): string | undefined {
  if (args.includes('--help') || args.includes('-h')) {
    return args.every(argument => argument === '--help' || argument === '-h')
      ? undefined
      : 'Help cannot be combined with screenshot setup options'
  }

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--') return 'Browser arguments are not accepted by screenshot-setup'
    if (argument === '--check' || argument === '--json') continue
    if (argument === '--root' || argument === '--config' || argument === '-c') {
      const value = args[++index]
      if (!value || value.startsWith('-')) return `Missing value for ${argument}`
      continue
    }
    if (argument.startsWith('--root=') || argument.startsWith('--config=')) {
      if (!argument.slice(argument.indexOf('=') + 1)) return `Missing value for ${argument.split('=')[0]}`
      continue
    }
    return `Unknown screenshot-setup option: ${argument}`
  }
  return undefined
}

/** Emit one fixed invalid-argument message on the contract-selected stream. */
export function reportInvalidScreenshotSetupArguments(json: boolean): void {
  if (json) process.stdout.write(`${JSON.stringify({ error: { code: 'invalid', message: 'Invalid screenshot-setup arguments.' } })}\n`)
  else process.stderr.write('Invalid screenshot-setup arguments.\n')
}
