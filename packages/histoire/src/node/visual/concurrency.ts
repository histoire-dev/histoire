/**
 * Run async work over items with bounded parallelism, overlapping filesystem latency.
 * Operations must handle their own failures; a rejection stops remaining items.
 */
export async function forEachVisualConcurrent<T>(items: readonly T[], limit: number, operation: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await operation(items[next++])
  }))
}
