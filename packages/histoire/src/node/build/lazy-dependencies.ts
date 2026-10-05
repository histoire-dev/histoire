/** Audited optional browser engines must stay on explicit UI/runtime import paths. */
export function isLazyBrowserDependency(id: string): boolean {
  const normalized = id.replaceAll('\\', '/')
  return /\/node_modules\/(?:dompurify|shiki|@shikijs|msw|@mswjs)(?:\/|$)/.test(normalized)
}
