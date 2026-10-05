import type { ContentIdentity, RegisteredText } from './files.js'

/** Private source handle; only virtual modules retain full source text. */
export interface SourceContentEntry {
  /** Registered source kind, never an arbitrary caller path. */
  kind: 'file' | 'virtual' | 'unavailable'
  /** Canonical physical path, excluded from public DTOs. */
  absolutePath?: string
  /** Original registered path retained to detect changed symlink aliases. */
  registeredPath?: string
  /** Captured virtual source bytes. */
  text?: string
  /** SHA-256 of full UTF-8 source. */
  sha256?: string
  /** Canonical read identity for later freshness checks. */
  identity?: ContentIdentity
  /** Bounded reason for unavailable source. */
  reason?: string
  /** Safe unavailable category kept separately from private explanations. */
  unavailableCode?: 'PATH_OUTSIDE_ROOT' | 'SOURCE_UNAVAILABLE'
}

/** Plain-text docs projected from existing collection/Markdown parsing. */
export interface DocsContentEntry {
  /** Markdown files preserve Markdown; inline collected docs are plain text. */
  kind: 'markdown' | 'text'
  /** Existing precedence used by UI documentation. */
  origin: 'sibling' | 'standalone' | 'collected'
  /** Registered project-relative Markdown path. */
  filePath?: string
  /** Physical Markdown path, excluded from public DTOs. */
  absolutePath?: string
  /** Original registered path retained to detect changed symlink aliases. */
  registeredPath?: string
  /** Raw physical hash detects edits even before watcher publication. */
  physicalSha256?: string
  /** Captured documentation content without frontmatter or HTML. */
  text: string
  /** Captured HTML from existing Markdown renderer. */
  html?: string
  /** Inline Vue docs provenance; MCP retains collected text semantics. */
  inline?: boolean
  /** SHA-256 of returned full documentation text. */
  sha256: string
}

/** Private content handles belonging to one immutable catalog entry. */
export interface StoryContentEntry {
  /** Raw source handle. */
  source: SourceContentEntry
  /** Preferred documentation, when present. */
  docs?: DocsContentEntry
  /** Private explanation when existing docs cannot safely be read. */
  docsUnavailableReason?: string
  /** Safe unavailable category kept separately from private explanations. */
  docsUnavailableCode?: 'PATH_OUTSIDE_ROOT' | 'SOURCE_UNAVAILABLE'
}

/** Injected access policy; default reads registered files without MCP containment. */
export type ContentReader = (root: string, path: string) => Promise<RegisteredText>
