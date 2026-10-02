/** Minimal deployment package; browser execution is the only optional installed dependency. */
export interface NodeArtifactPackage {
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
  /** Optional runtime prerequisite for screenshots and compiled preview tests. */
  optionalDependencies?: { playwright: string }
}

/** Produces no project/framework/Vite dependency or deployment secret. */
export function createNodePackage(version: string, playwrightVersion?: string): NodeArtifactPackage {
  return { private: true, type: 'module', version, engines: { node: '>=22' }, scripts: { start: 'node server.mjs' }, ...(playwrightVersion ? { optionalDependencies: { playwright: playwrightVersion } } : {}) }
}
