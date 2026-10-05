import type { HistoireSnapshot } from '@histoire/protocol'

/** URL tab values retained by standalone navigation. */
export type InspectorTab = '' | 'docs' | 'events' | 'tests'

/** Standalone test surfaces require both a dev build and a connected dev source. */
export function isInspectorTestsEnabled(devBuild: boolean, sourceMode: 'dev' | 'static' | undefined): boolean {
  return devBuild && sourceMode === 'dev'
}

/** Available route registry also bounds keyboard navigation and URL fallback. */
export function getInspectorTabs(testsEnabled: boolean): { value: InspectorTab, label: string }[] {
  return [{ value: '', label: 'Props' }, { value: 'docs', label: 'Docs' }, { value: 'events', label: 'Events' }, ...(testsEnabled ? [{ value: 'tests' as const, label: 'Tests' }] : [])]
}

/** Unknown values and unavailable dev-only Tests URLs resolve to Props. */
export function normalizeInspectorTab(value: unknown, testsEnabled = true): InspectorTab {
  return value === 'docs' || value === 'events' || (value === 'tests' && testsEnabled) ? value : ''
}

/** Track unread events locally; retained history never crosses selected document. */
export function createInspectorEventCounter() {
  let owner: string | undefined
  let seen = 0
  return {
    /** Read event ownership only; accepts readonly provider snapshots without mutable state. */
    observe(snapshot: Readonly<Pick<HistoireSnapshot, 'source' | 'selection' | 'runtime' | 'events'>>, visible: boolean): number {
      const identity = JSON.stringify([snapshot.source?.sourceId, snapshot.source?.epoch, snapshot.selection, snapshot.runtime.runtimeId])
      const items = snapshot.events.items.filter(event => event.runtimeId === snapshot.runtime.runtimeId && event.target.storyId === snapshot.selection?.storyId && event.target.variantId === snapshot.selection?.variantId)
      const latest = items.reduce((sequence, event) => Math.max(sequence, event.sequence), 0)
      if ((owner !== undefined && owner !== identity) || visible) seen = latest
      owner = identity
      return items.filter(event => event.sequence > seen).length
    },
  }
}

/** Compare generated text only; initial loading and unchanged snapshots stay unmarked. */
export function findChangedSourceLine(previous: string | undefined, next: string): number {
  if (previous === undefined || previous === next) return -1
  const before = previous.split('\n')
  const after = next.split('\n')
  const changed = after.findIndex((line, index) => line !== before[index])
  return changed === -1 ? Math.max(0, after.length - 1) : changed
}
