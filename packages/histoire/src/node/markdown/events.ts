const handlers: (() => unknown)[] = []

/** Registers a Markdown inventory/content listener with explicit runtime ownership. */
export function onMarkdownListChange(handler: () => unknown) {
  handlers.push(handler)
  return () => {
    const index = handlers.indexOf(handler)
    if (index !== -1) handlers.splice(index, 1)
  }
}

/** Announces complete Markdown parsing/association changes. */
export function notifyMarkdownListChange() {
  for (const handler of handlers) handler()
}
