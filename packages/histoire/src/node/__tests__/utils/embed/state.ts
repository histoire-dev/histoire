/** Sparse array fixture preserves holes; Array.from would turn them into undefined leaves. */
export function createEmbedSparseArray(length: number): unknown[] {
  const array: unknown[] = []
  array.length = length
  return array
}

/** One cyclic cleaned-state builder shared by sizing, DTO and transport tests. */
export function createEmbedCyclicState(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const state = { ...fields }
  state.self = state
  return state
}
