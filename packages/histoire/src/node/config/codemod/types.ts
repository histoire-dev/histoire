import type { ASTNode } from 'magicast'

/** Values accepted by project settings, with no executable expressions. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** One allowlisted setting replacement; undefined removes the setting. */
export interface ConfigPatch {
  /** Dot path, optionally selecting an agent preset by its stable id. */
  path: string
  /** JSON value to save, or undefined to remove. */
  value: JsonValue | undefined
}

/** Root against which file access is checked. Defaults to process.cwd(). */
export interface ConfigAccessOptions {
  /** Project directory; config access never escapes its real path. */
  root?: string
}

/** One-based source location suitable for UI source badges. */
export interface ConfigLocation {
  /** Source line. */
  line: number
  /** Source column. */
  column: number
}

/** Whether a setting can safely be saved without running source code. */
export interface ConfigPathAnalysis {
  /** Editable literals, missing settings, or refused executable values. */
  status: 'absent' | 'editable' | 'computed' | 'function-only'
  /** Location of the property or expression responsible for this result. */
  location?: ConfigLocation
  /** Human-readable refusal, including its source line. */
  reason?: string
}

/** Object literals accepted by the source walker. */
export type ObjectNode = Extract<ASTNode, { type: 'ObjectExpression' }>
/** Array literals accepted by the source walker. */
export type ArrayNode = Extract<ASTNode, { type: 'ArrayExpression' }>
/** Statically named, ordinary object properties. */
export type PropertyNode = Extract<ASTNode, { type: 'ObjectProperty' }>
/** A string selects a property; an id selects an agent preset. */
export type PathToken = string | { id: string }

/** Local initializer metadata; let/var bindings remain intentionally refused. */
export interface ConfigBinding {
  /** Declaration type. */
  kind: string
  /** Initializer, when present. */
  node?: ASTNode
}

/** Parsed source with lexical bindings available to the config object. */
export interface ParsedConfig {
  /** Original source, retained for exact range edits. */
  code: string
  /** Program produced by magicast's Babel/TypeScript parser. */
  program: Extract<ASTNode, { type: 'Program' }>
  /** Visible local declarations. */
  bindings: Map<string, ConfigBinding>
  /** Imported identifiers and their module specifiers. */
  imports: Map<string, string>
}

/** Static value or a precise reason why it cannot be followed. */
export interface ResolvedNode {
  /** Followed literal node. */
  node?: ASTNode
  /** Refusal classification. */
  issue?: ConfigPathAnalysis
}

/** Source range replacement applied without reprinting siblings. */
export interface SourceEdit {
  /** First replaced byte offset. */
  start: number
  /** First untouched byte offset after replacement. */
  end: number
  /** New source occupying this range. */
  code: string
}
