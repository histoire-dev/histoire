/** Public project metadata shown by development and static workbenches. */
export interface HistoireBuildInfo {
  /** Project package version, when available. */
  version?: string
  /** Git commit, when project belongs to a repository. */
  commit?: string
  /** Git branch, when checkout has a named branch. */
  branch?: string
  /** Stable timestamp for this server or build generation. */
  builtAt: string
  /** Changed stories, emitted only when change information is requested. */
  changed?: {
    /** Stable story identity. */
    storyId: string
    /** Added or modified story file. */
    kind: 'new' | 'changed'
  }[]
}
