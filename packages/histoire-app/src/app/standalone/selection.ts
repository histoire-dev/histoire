import type { HistoireSession, HistoireStoryLink, HistoireTarget } from '@histoire/sdk/internal'
import { getHistoireSessionDescriptor, isHistoirePrimaryMountActive, registerHistoireSessionInternals, requestHistoireOpenInEditor, requestHistoireStatePreset, waitForHistoireSelection } from '@histoire/sdk/internal'
import { resolveAutoSelectedVariantId } from '../util/variant-selection.js'

/** Standalone preserves variant chooser while browser SDK retains story-only first/remembered behavior. */
export function createStandaloneSelection(session: HistoireSession) {
  const remembered = new Map<string, string>()
  let navigate: (target: HistoireTarget, link?: HistoireStoryLink) => Promise<unknown> = async () => {}
  let navigationIntents = 0
  let selectionGeneration = 0
  const stop = session.subscribe((snapshot) => {
    if (snapshot.selection?.variantId) remembered.set(snapshot.selection.storyId, snapshot.selection.variantId)
  })
  /** Structured identities remain separate even when both contain colons. */
  function resolve(input: { storyId: string, variantId?: string | null }): HistoireTarget {
    const story = session.getSnapshot().catalog.stories.find(story => story.id === input.storyId)
    // Docs catalogs can retain legacy synthetic variants. An omitted variant
    // opens the document, never that synthetic preview; explicit unknown IDs
    // still pass through the SDK's normal validation.
    if (story?.docsOnly && (input.variantId === undefined || input.variantId === '_default')) return { storyId: input.storyId, variantId: null }
    if (input.variantId !== undefined) return { storyId: input.storyId, variantId: input.variantId }
    const last = remembered.get(input.storyId)
    const variantId = resolveAutoSelectedVariantId(story ? { variants: story.variants, lastSelectedVariant: last ? { id: last } : undefined } : null, null) ?? (story?.layout?.type === 'grid' ? story.variants[0]?.id ?? null : null)
    return { storyId: input.storyId, variantId }
  }
  /** One selection path owns normal navigation and finite Markdown presentation together. */
  async function select(input: { storyId: string, variantId?: string | null }, link?: HistoireStoryLink): Promise<void> {
    const target = resolve(input)
    const source = session.getSnapshot().source
    const generation = ++selectionGeneration
    navigationIntents++
    let operation: Promise<void>
    let navigated = false
    /** Only latest source-confirmed target may own the current route. */
    function ownsNavigation(): boolean {
      const current = session.getSnapshot()
      return generation === selectionGeneration
        && current.status === 'ready'
        && current.selection?.storyId === target.storyId
        && current.selection.variantId === target.variantId
        && current.source?.sourceId === source?.sourceId
        && current.source?.epoch === source?.epoch
        && current.source?.revision === source?.revision
    }
    // Accepted URL must survive cold Vite optimization reload before runtime ACK.
    // Source replacement during synchronous publication cannot acquire old URL intent.
    try {
      operation = session.selection.select(target)
      if (ownsNavigation()) {
        await (link ? navigate(target, link) : navigate(target))
        navigated = true
      }
      await operation
      // Some adapters publish selection only after their async operation settles.
      // That accepted target still owns navigation unless a newer intent replaced it.
      if (!navigated && ownsNavigation()) await (link ? navigate(target, link) : navigate(target))
    }
    finally { navigationIntents-- }
  }
  const facade: HistoireSession = { ...session, selection: { select } }
  registerHistoireSessionInternals(facade, { descriptor: () => getHistoireSessionDescriptor(session), presets: action => requestHistoireStatePreset(session, action), openInEditor: target => requestHistoireOpenInEditor(session, target), docsPolicy: 'trusted-local', selectionSettled: () => waitForHistoireSelection(session), primaryMountActive: mount => isHistoirePrimaryMountActive(session, mount), storyLink: link => select(link.selection, link) })
  return { session: facade, resolve,
    /** Canonical observer ignores facade intents that already own URL push. */
    isNavigating: () => navigationIntents > 0,
    /** Install explicit URL adapter; embedded providers never receive one. */
    setNavigate(value: typeof navigate) {
      navigate = value
    },
    /** Route changes select without recursively pushing URL. */
    async fromRoute(input: { storyId: string, variantId?: string | null }): Promise<HistoireTarget> {
      const target = resolve(input)
      const current = session.getSnapshot().selection
      if (target.storyId !== current?.storyId || target.variantId !== current?.variantId) await session.selection.select(target)
      return target
    }, close: stop }
}
