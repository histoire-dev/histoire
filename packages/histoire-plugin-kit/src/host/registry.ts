import type { ContributionKind, QualifiedContribution, WorkbenchContribution } from '../types/contribution.js'
import type { ContributionRank } from './ordering.js'
import { PluginDefinitionError } from '../errors.js'
import { compareRanks } from './ordering.js'

/**
 * Runtime list of contribution kinds. `satisfies` keeps it in sync with `ContributionKindMap`:
 * adding a kind to the type map fails compilation until it is listed here.
 */
const KINDS = {
  'inspector.tab': true,
  'inspector.section': true,
  'toolbar.item': true,
  'command': true,
  'shortcut': true,
  'frame-menu.item': true,
  'context-menu.item': true,
  'canvas.overlay': true,
  'canvas.frame-overlay': true,
  'canvas.frame-badge': true,
  'canvas.tool': true,
  'canvas.view': true,
  'shell.pane': true,
  'settings.section': true,
  'home.section': true,
} satisfies Record<ContributionKind, true>

/** One committed or provisional registration. */
export interface RegistryEntry {
  /** Frozen qualified contribution exposed to surfaces. */
  readonly contribution: QualifiedContribution
  /** Sort key. */
  readonly rank: ContributionRank
  /** Owner scope signal; actions run under it. */
  readonly owner: AbortSignal
}

/** Per-host contribution registry keyed by qualified id, grouped by kind. */
export interface Registry {
  /** Committed entry by qualified id. */
  get: (id: string) => RegistryEntry | undefined
  /** Frozen ordered snapshot of one kind. */
  contributions: <K extends ContributionKind>(kind: K) => ReadonlyArray<QualifiedContribution<K>>
  /** Exposes entries atomically; notifies once. Ids must be unique (checked by the owner). */
  commit: (entries: ReadonlyArray<RegistryEntry>) => void
  /** Removes committed entries; notifies once if any was present. */
  remove: (ids: Iterable<string>) => void
  /** Runs `fn` with notifications deferred to a single one after it returns. */
  batch: (fn: () => void) => void
}

/** Shared frozen empty snapshot. */
const EMPTY: ReadonlyArray<never> = Object.freeze([])

/**
 * Validates a raw contribution and builds its frozen qualified form.
 * @param contribution Contribution as passed by a plugin or the app.
 * @param namespace Plugin id, or `builtin`.
 * @param qualifiedId Already validated `${namespace}:${id}`.
 */
export function qualifyContribution(contribution: WorkbenchContribution, namespace: string, qualifiedId: string): QualifiedContribution {
  return Object.freeze({ ...contribution, id: qualifiedId, pluginId: namespace, localId: contribution.id })
}

/**
 * Throws unless `contribution` is an object of a known kind.
 * @param contribution Untrusted contribution value.
 * @param pluginId Owner used for attribution.
 */
export function assertKnownKind(contribution: unknown, pluginId: string): asserts contribution is WorkbenchContribution {
  const kind = typeof contribution === 'object' && contribution !== null ? (contribution as { kind?: unknown }).kind : undefined
  if (typeof kind !== 'string' || !Object.hasOwn(KINDS, kind)) {
    throw new PluginDefinitionError(`unknown contribution kind ${JSON.stringify(kind)}`, pluginId)
  }
}

/**
 * Creates an empty registry.
 * @param notify Called after each commit or removal that changed the registry.
 */
export function createRegistry(notify: () => void): Registry {
  const entries = new Map<string, RegistryEntry>()
  const snapshots = new Map<ContributionKind, ReadonlyArray<QualifiedContribution>>()
  let batchDepth = 0
  let dirty = false

  /**
   * Rebuilds snapshots of changed kinds so unchanged kinds keep their array identity.
   * @param kinds Kinds touched by the change.
   */
  function changed(kinds: Set<ContributionKind>): void {
    if (!kinds.size) return
    for (const kind of kinds) {
      const sorted = [...entries.values()]
        .filter(entry => entry.contribution.kind === kind)
        .sort((a, b) => compareRanks(a.rank, b.rank))
        .map(entry => entry.contribution)
      snapshots.set(kind, Object.freeze(sorted))
    }
    dirty = true
    flush()
  }

  /** Emits one notification outside batches. */
  function flush(): void {
    if (batchDepth || !dirty) return
    dirty = false
    notify()
  }

  return {
    get: id => entries.get(id),
    contributions: kind => (snapshots.get(kind) ?? EMPTY) as unknown as ReadonlyArray<QualifiedContribution<typeof kind>>,
    commit(batch) {
      const kinds = new Set<ContributionKind>()
      for (const entry of batch) {
        entries.set(entry.contribution.id, entry)
        kinds.add(entry.contribution.kind)
      }
      changed(kinds)
    },
    remove(ids) {
      const kinds = new Set<ContributionKind>()
      for (const id of ids) {
        const entry = entries.get(id)
        if (!entry) continue
        entries.delete(id)
        kinds.add(entry.contribution.kind)
      }
      changed(kinds)
    },
    batch(fn) {
      batchDepth++
      try {
        fn()
      }
      finally {
        batchDepth--
        flush()
      }
    },
  }
}
