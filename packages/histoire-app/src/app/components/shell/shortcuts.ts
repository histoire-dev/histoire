/** Theme shortcut stays scoped to exact provider and yields to handled input. */
export function handleShellShortcut(event: KeyboardEvent, root: HTMLElement | null, toggleTheme: () => void): void {
  const target = event.target as Element | null
  if (!root || event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'd' || target?.closest('.histoire-provider') !== root) return
  event.preventDefault()
  event.stopPropagation()
  toggleTheme()
}
