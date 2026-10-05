import type { InjectionKey } from 'vue'
import type { SettingsStorage } from './settings.js'
import { inject, provide, shallowRef } from 'vue'
import { createClientUuid } from '../util/dev-event-api.js'
import { projectValueSignature, readProjectSaves, writeProjectSaves } from './project-save-persistence.js'

/** Server analysis of one allowlisted setting. */
export interface ProjectConfigPath {
  /** Literal, absent, or code-owned option. */
  status: 'absent' | 'editable' | 'computed' | 'function-only'
  /** Source location for provenance badges. */
  location?: { line: number, column: number }
  /** Explanation for computed options. */
  reason?: string
}

/** Bounded server reply; never contains environment values. */
export interface ProjectConfigState {
  /** Correlation with server-owned explicit save receipt. */
  requestId?: string
  /** Only saved completion may retire local preferences. */
  completion?: 'pending' | 'saved' | 'failed'
  /** Project-relative config file. */
  file?: string
  /** Hash binding next write to exact read version. */
  hash?: string
  /** Status for requested allowlisted paths. */
  paths: Record<string, ProjectConfigPath>
  /** Successfully saved options. */
  saved?: string[]
  /** Safe public error. */
  error?: string
}

/** Source-owned HMR dependency; injected in tests and omitted from static books. */
export interface ProjectConfigTransport {
  /** Send one bounded request. */
  send: (event: 'histoire:ui:config-read' | 'histoire:ui:config-save', value: unknown) => boolean
  /** Subscribe to config state replies. */
  subscribe: (callback: (value: ProjectConfigState) => void) => () => void
}

/** Per-workbench config owner suppresses replies after disposal. */
export function createProjectConfigStore(transport?: ProjectConfigTransport, persistence: { storage?: SettingsStorage, key?: string } = {}) {
  const state = shallowRef<ProjectConfigState>({ paths: {} })
  const pending = shallowRef(false)
  const saved = new Set<() => void>()
  let active = true
  let requested: string[] = []
  const key = persistence.key ?? '_histoire-ui-project-save'
  let receipts = readProjectSaves(persistence.storage, key)
  pending.value = receipts.some(receipt => receipt.completion !== 'saved')
  /** Only one explicit write is active; acknowledged receipts remain consumable by their own path. */
  const pendingReceipt = () => receipts.find(receipt => receipt.completion !== 'saved')
  /** Saved paths are derived from durable receipts, never from a replaced state reply. */
  const savedPaths = () => [...new Set(receipts.filter(receipt => receipt.completion === 'saved').flatMap(receipt => receipt.patches.map(patch => patch.path)))]
  /** Keeps every unconsumed receipt durable across section and workbench replacement. */
  const persistReceipts = () => writeProjectSaves(persistence.storage, key, receipts)
  /** Merges source metadata without allowing it to discard locally acknowledged receipts. */
  function publish(value: ProjectConfigState): void {
    const confirmed = savedPaths()
    state.value = { ...value, paths: { ...state.value.paths, ...value.paths }, saved: confirmed.length ? confirmed : undefined }
  }
  const unsubscribe = transport?.subscribe((value) => {
    if (!active) return
    // A reconnect snapshot requests the retained capability, never another write.
    if (!value.requestId && !value.file && !value.hash && !value.error && !Object.keys(value.paths).length) {
      const paths = pendingReceipt()?.patches.map(patch => patch.path) ?? requested
      if (paths.length) read(paths)
      return
    }
    const receipt = value.requestId ? receipts.find(item => item.requestId === value.requestId) : undefined
    if (value.requestId && !receipt) return
    if (value.completion === 'saved' && receipt) {
      receipt.patches = receipt.patches.filter(patch => value.saved?.includes(patch.path))
      receipt.completion = 'saved'
      receipts = receipts.filter(item => item !== receipt || item.patches.length > 0)
      persistReceipts()
    }
    if (value.completion === 'failed' && receipt) {
      receipts = receipts.filter(item => item !== receipt)
      persistReceipts()
    }
    publish(value)
    pending.value = Boolean(pendingReceipt())
    if (value.completion === 'saved' && value.saved?.length) {
      for (const callback of saved) callback()
    }
    // A conflicting write must first reread source; never replay patches automatically.
    if (value.error?.includes('conflict')) read(requested)
  })
  /** Read just currently visible section paths. */
  function read(paths: string[]): void {
    if (!active || !transport) return
    const receipt = pendingReceipt()
    requested = [...new Set([...paths, ...receipt?.patches.map(patch => patch.path) ?? []])]
    pending.value = transport.send('histoire:ui:config-read', { paths: requested, ...receipt ? { requestId: receipt.requestId } : {} }) || Boolean(receipt)
  }
  return {
    state,
    pending,
    available: Boolean(transport),
    read,
    /** Explicit confirm is required by the component before submitting patches. */
    save(patches: { path: string, value: unknown }[]): void {
      if (!active || !transport || pending.value) return
      state.value = { ...state.value, error: undefined, saved: undefined }
      try {
        const submitted = { requestId: createClientUuid(), patches: JSON.parse(JSON.stringify(patches)) }
        const replacedPaths = new Set(submitted.patches.map(patch => patch.path))
        const previous = receipts
        // A newer local edit owns the same path, so an older receipt cannot later reset it.
        receipts = [...receipts.flatMap((receipt) => {
          if (receipt.completion !== 'saved') return [receipt]
          const retained = receipt.patches.filter(patch => !replacedPaths.has(patch.path))
          return retained.length ? [{ ...receipt, patches: retained }] : []
        }), submitted]
        if (!persistReceipts()) {
          receipts = previous
          throw new Error('Pending project save exceeds transport limit')
        }
        pending.value = transport.send('histoire:ui:config-save', { ...submitted, expectedHash: state.value.hash })
        if (!pending.value) {
          receipts = previous
          persistReceipts()
        }
      }
      catch {
        pending.value = false
        state.value = { ...state.value, error: 'Could not send project config save.' }
      }
    },
    /** Retires only unchanged submitted values, once, after authoritative completion. */
    consumeSaved(path: string, value: unknown): boolean {
      const receipt = [...receipts].reverse().find(item => item.completion === 'saved' && item.patches.some(patch => patch.path === path))
      if (!receipt) return false
      const patch = receipt.patches.find(item => item.path === path)
      const unchanged = !!patch && projectValueSignature(patch.value) === projectValueSignature(value)
      receipt.patches = receipt.patches.filter(item => item.path !== path)
      receipts = receipts.filter(item => item !== receipt || item.patches.length > 0)
      persistReceipts()
      publish({ ...state.value, paths: state.value.paths })
      return unchanged
    },
    /** Section-specific reset occurs only after acknowledged save of its path. */
    onSaved(callback: () => void): () => void {
      saved.add(callback)
      return () => saved.delete(callback)
    },
    /** No late reply can mutate a closed workbench. */
    close(): void {
      active = false
      unsubscribe?.()
      saved.clear()
    },
  }
}

/** Optional nearest-workbench injection. */
const projectKey: InjectionKey<ReturnType<typeof createProjectConfigStore>> = Symbol('histoire-project-config')

/** Installs dev transport owned by standalone lifetime. */
export function provideProjectConfigStore(store: ReturnType<typeof createProjectConfigStore>): void {
  provide(projectKey, store)
}

/** Static and embedded surfaces have no config writer. */
export function useProjectConfigStore(): ReturnType<typeof createProjectConfigStore> | undefined {
  return inject(projectKey, undefined)
}
