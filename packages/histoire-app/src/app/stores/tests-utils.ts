/**
 * Removes every matching key from a record without retaining empty entries.
 * @param record Per-variant record to filter.
 * @param shouldDrop Predicate receiving each key.
 */
export function omitTestStoreKeys<T>(
  record: Record<string, T>,
  shouldDrop: (key: string) => boolean,
): Record<string, T> {
  const dropped = Object.keys(record).filter(shouldDrop)
  if (!dropped.length) {
    return record
  }
  const result = { ...record }
  for (const key of dropped) {
    delete result[key]
  }
  return result
}

/**
 * Detects expected request aborts caused by replacing or leaving an iframe.
 * Timeouts and other transport failures remain visible to users.
 * @param error Rejection from preview request plumbing.
 */
export function isPreviewNavigationAbort(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.startsWith('Preview iframe was detached ')
    || message.startsWith('Preview iframe was reloaded ')
    || message.startsWith('Preview iframe navigated away ')
}
