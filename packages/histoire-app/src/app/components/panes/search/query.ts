import type { HistoireCatalogStory, HistoireSearchResult, HistoireTarget } from '@histoire/protocol'
import { getHistoireTargetKey } from '@histoire/protocol'
import { matchSearchText } from '../../../../embed/search-match.js'

/** Available local result scopes. */
export type SearchScope = 'all' | 'stories' | 'docs' | 'props'

/** Workbench search decorates ranked source results without rebuilding its title index. */
export interface WorkbenchSearchResult {
  /** Exact tuple and result kind, never a separator-parsed identity. */
  id: string
  /** Result kind and activation behavior. */
  kind: HistoireSearchResult['kind'] | 'prop'
  /** Exact session activation target. */
  target: HistoireTarget
  /** Primary display text. */
  title: string
  /** Human-readable folder/story context. */
  path: readonly string[]
  /** Optional projected content or prop type. */
  excerpt?: string
  /** Optional collected story icon color. */
  iconColor?: string
  /** Original ranked result, preserved for documentation anchors. */
  source?: HistoireSearchResult
  /** Shared relevance used when merging source results and loaded props. */
  match?: HistoireSearchResult['match']
}

/** Only metadata needed for client-side props search is retained. */
export interface LoadedPropName {
  /** Collected prop name. */
  name: string
  /** Runtime component display name. */
  component: string
  /** Projected prop type labels. */
  types: readonly string[]
}

/** Loaded metadata stays attributed to the exact runtime target. */
export interface LoadedProps {
  /** Exact story and variant owning these definitions. */
  target: HistoireTarget
  /** Safe prop metadata read from canonical state. */
  names: readonly LoadedPropName[]
}

/** Project source results in order while treating docs-only entries as documents. */
export function projectSearchResults(results: readonly HistoireSearchResult[], stories: readonly HistoireCatalogStory[]): WorkbenchSearchResult[] {
  const seen = new Set<string>()
  return results.flatMap((source) => {
    const story = stories.find(story => story.id === source.target.storyId)
    if (story?.docsOnly && source.kind === 'variant') return []
    const kind = story?.docsOnly && source.kind === 'story' ? 'docs' : source.kind
    // Title/body hits share one action; keep the winning source's anchor intact.
    const key = JSON.stringify([source.target.storyId, source.target.variantId, kind])
    if (seen.has(key)) return []
    seen.add(key)
    const id = JSON.stringify([source.target.storyId, source.target.variantId, kind, source.anchor])
    return [{ id, kind, target: source.target, title: source.title, path: story?.path ?? [], excerpt: source.excerpt, iconColor: story?.iconColor, source, match: source.match }]
  })
}

/** Docs-only title hits activate Docs while keeping ranked source metadata untouched. */
export function getSearchActivationResult(result: WorkbenchSearchResult): HistoireSearchResult {
  const source: HistoireSearchResult = result.source ?? { target: result.target, title: result.title, kind: 'variant', rank: 0 }
  return result.kind === 'docs' && source.kind !== 'docs' ? { ...source, kind: 'docs' } : source
}

/** Read only structurally valid derived prop names; never retain live state values. */
export function readPropNames(value: Readonly<Record<string, unknown>> | readonly unknown[]): LoadedPropName[] {
  const definitions = (value as Record<string, unknown>)._hPropDefs
  if (!Array.isArray(definitions)) return []
  return definitions.flatMap((component) => {
    if (!component || typeof component !== 'object' || !Array.isArray(component.props)) return []
    return component.props.flatMap((prop: unknown) => {
      if (!prop || typeof prop !== 'object' || !('name' in prop) || typeof prop.name !== 'string') return []
      const types = 'types' in prop && Array.isArray(prop.types) ? prop.types.filter((type): type is string => typeof type === 'string') : []
      return [{ name: prop.name, component: String(component.name ?? 'Component'), types }]
    })
  })
}

/** Props use shared matching over loaded metadata without mounting another runtime. */
export function matchLoadedProps(loaded: readonly LoadedProps[], stories: readonly HistoireCatalogStory[], query: string): WorkbenchSearchResult[] {
  if (query.startsWith('>')) return []
  const candidates = loaded.flatMap(({ target, names }) => {
    const story = stories.find(story => story.id === target.storyId)
    if (!story || !story.variants.some(variant => variant.id === target.variantId)) return []
    return names.map(prop => ({
      item: {
        id: JSON.stringify([target.storyId, target.variantId, 'prop', prop.component, prop.name]),
        kind: 'prop' as const,
        target,
        title: prop.name,
        path: story.path,
        excerpt: [prop.component, prop.types.join(' | ')].filter(Boolean).join(' · '),
        iconColor: story.iconColor,
      },
      titles: [prop.name],
      context: prop.component,
    }))
  })
  return matchSearchText(candidates, query).map(({ item, match }) => ({ ...item, match }))
}

/** Highlight only selected story frames; story hits include every collected variant. */
export function getSearchFrameMatches(results: readonly WorkbenchSearchResult[], story: HistoireCatalogStory | undefined): string[] {
  if (!story) return []
  const targets = results.filter(result => result.kind !== 'docs' && result.target.storyId === story.id)
  return [...new Set(targets.flatMap(result => result.kind === 'story'
    ? story.variants.map(variant => getHistoireTargetKey({ storyId: story.id, variantId: variant.id }))
    : result.target.variantId ? [getHistoireTargetKey(result.target)] : []))]
}
