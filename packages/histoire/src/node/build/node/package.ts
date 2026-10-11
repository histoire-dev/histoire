/** One optional browser package pinned to the driver exercised by this build. */
export interface NodeArtifactBrowserDriver {
  /** Supported package selected by project-first discovery. */
  packageName: 'playwright' | 'playwright-core'
  /** Exact installed package version. */
  version: string
}

/** Exactly one selected browser driver may be emitted in package metadata. */
export type NodeArtifactBrowserDependencies =
  | { 'playwright': string, 'playwright-core'?: never }
  | { 'playwright'?: never, 'playwright-core': string }

/** Minimal deployment package; browser execution is the only optional installed dependency. */
export type NodeArtifactPackage = {
  /** Artifact is never a publishable Histoire package. */
  private: true
  /** Native ESM execution without runtime transpilation. */
  type: 'module'
  /** Building Histoire version for inspectable package metadata. */
  version: string
  /** Minimum tested native runtime. */
  engines: { node: '>=22' }
  /** Direct standalone production entry. */
  scripts: { start: 'node server.mjs' }
} & ({ optionalDependencies?: never } | { optionalDependencies: NodeArtifactBrowserDependencies })

/**
 * Produces no project/framework/Vite dependency or deployment secret.
 * @param version Histoire version recorded in generated package metadata.
 * @param browserDriver Exact optional browser driver selected for this build.
 */
export function createNodePackage(version: string, browserDriver?: NodeArtifactBrowserDriver | string): NodeArtifactPackage {
  const selected = typeof browserDriver === 'string'
    ? browserDriver ? { packageName: 'playwright' as const, version: browserDriver } : undefined
    : browserDriver
  const metadata = { private: true, type: 'module', version, engines: { node: '>=22' }, scripts: { start: 'node server.mjs' } } as const
  if (!selected) return metadata
  const optionalDependencies = { [selected.packageName]: selected.version } as NodeArtifactBrowserDependencies
  return { ...metadata, optionalDependencies }
}
