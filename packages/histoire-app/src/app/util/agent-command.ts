/**
 * Formats an agent launch command as a readable shell-like line.
 * Arguments containing whitespace or quotes are double-quoted for display only.
 * @param command Executable name or path.
 * @param args Exact argument values passed to the process.
 */
export function formatAgentCommand(command: string, args: readonly string[] = []): string {
  return [command, ...args].map(part => part === '' || /[\s"']/.test(part) ? JSON.stringify(part) : part).join(' ')
}
