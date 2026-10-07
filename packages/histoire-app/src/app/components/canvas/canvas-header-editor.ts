import type { HistoireSnapshot, HistoireSourceIdentity, HistoireTarget } from '@histoire/protocol'
import type { HistoireCatalogStory, HistoireSession } from '@histoire/sdk'
import { isHistoireProjectFileOrigin } from '@histoire/protocol'
import { canOpenHistoireTargetInEditor, requestHistoireOpenInEditor } from '@histoire/sdk/internal'
import { computed } from 'vue'

/** Inputs read from CanvasViewport's canonical session and displayed header state. */
export interface CanvasHeaderEditorOptions {
  /** Current session owning the selected catalog target. */
  session: HistoireSession
  /** Returns latest canonical session snapshot. */
  snapshot: () => HistoireSnapshot
  /** Returns the story currently present in the canonical catalog. */
  currentStory: () => HistoireCatalogStory | undefined
  /** Returns metadata currently displayed by the canvas header. */
  displayedStory: () => HistoireCatalogStory | undefined
  /** Returns whether collection failed for the displayed story. */
  hasCollectionError: () => boolean
  /** Returns whether canvas content currently obscures the header. */
  isObscured: () => boolean
  /** Publishes an active editor request failure through CanvasViewport. */
  reportError: (error: unknown) => void
}

/** Source and target captured when one filename action starts. */
interface CanvasHeaderEditorRequest {
  /** Exact selected story and variant, including null variant selection. */
  target: HistoireTarget
  /** Revision identity required to reject stale failures. */
  source: Pick<HistoireSourceIdentity, 'sourceId' | 'epoch' | 'revision'>
}

/** Creates capability gating and stale-safe dispatch for the canvas filename. */
export function createCanvasHeaderEditor(options: CanvasHeaderEditorOptions) {
  /** Capture only a live, visible catalog selection backed by a dev editor. */
  function currentRequest(): CanvasHeaderEditorRequest | null {
    const state = options.snapshot()
    const story = options.currentStory()
    const selection = state.selection
    const source = state.source
    if (!story || options.displayedStory()?.id !== story.id || options.hasCollectionError() || options.isObscured()) return null
    if (!isHistoireProjectFileOrigin(story.fileOrigin)) return null
    if (!selection || selection.storyId !== story.id || state.status !== 'ready' || state.stale) return null
    if (!source || !canOpenHistoireTargetInEditor(state, selection)) return null
    return {
      target: { storyId: selection.storyId, variantId: selection.variantId },
      source: { sourceId: source.sourceId, epoch: source.epoch, revision: source.revision },
    }
  }

  /** Confirms request failure still belongs to current source and selection. */
  function requestIsCurrent(captured: CanvasHeaderEditorRequest): boolean {
    const state = options.snapshot()
    const source = state.source
    const selection = state.selection
    return state.status === 'ready'
      && !state.stale
      && state.capabilities.openInEditor.available
      && source?.mode === 'dev'
      && source.sourceId === captured.source.sourceId
      && source.epoch === captured.source.epoch
      && source.revision === captured.source.revision
      && selection?.storyId === captured.target.storyId
      && selection.variantId === captured.target.variantId
      && options.currentStory()?.id === captured.target.storyId
      && options.displayedStory()?.id === captured.target.storyId
      && isHistoireProjectFileOrigin(options.currentStory()?.fileOrigin)
      && !options.hasCollectionError()
  }

  /** Opens the exact selected target and ignores failures after ownership changes. */
  async function openInEditor(): Promise<void> {
    const captured = currentRequest()
    if (!captured) return
    try {
      await requestHistoireOpenInEditor(options.session, captured.target)
    }
    catch (error) {
      if (requestIsCurrent(captured)) options.reportError(error)
    }
  }

  return { canOpenInEditor: computed(() => currentRequest() !== null), openInEditor }
}
