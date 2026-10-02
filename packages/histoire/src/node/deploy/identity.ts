/** Deterministic JSON shared by artifact writer and immutable runtime validation. */
export function canonicalArtifactJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalArtifactJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalArtifactJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}
