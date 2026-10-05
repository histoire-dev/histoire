import type { HistoireSearchResult } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk/internal'
import type { ClientCommand, ClientCommandContext } from '@histoire/shared'
import type { Router } from 'vue-router'
import { getHistoireTargetKey } from '@histoire/protocol'
import { requestHistoireOpenInEditor } from '@histoire/sdk/internal'
import { registeredCommands } from 'virtual:$histoire-commands'
import { files, onUpdate } from 'virtual:$histoire-stories'
import { shallowRef } from 'vue'
import { createBuiltinCommands } from '../util/builtin-commands.js'
import { mapFile } from '../util/mapping.js'
import { createStandaloneClientActions } from './client-actions.js'

/** Standalone plugin commands retain legacy context while story modules stay sandbox-owned. */
export function createStandaloneCommands(session: HistoireSession, router: Router) {
  const metadata = shallowRef(files.map(file => mapFile(file)))
  const snapshot = shallowRef(session.getSnapshot())
  const active = shallowRef(true)
  // Visibility depends on canonical state/capabilities, not only query changes.
  // This publication is shared by every reactive list/context consumer.
  const stopSnapshot = session.subscribe(value => snapshot.value = value)
  const actions = createStandaloneClientActions(session)
  // Virtual metadata subscriptions survive HMR, and are owned by this bootstrap.
  const off = onUpdate((files) => {
    if (active.value) metadata.value = files.map(file => mapFile(file))
  })
  /** showIf/getParams receive read-only state; only clientAction gets an owned editable projection. */
  function context(): ClientCommandContext {
    const current = snapshot.value
    const collected = metadata.value.find(file => file.story.id === current.selection?.storyId)?.story
    const variants = collected?.variants.map(variant => Object.freeze({ ...variant, state: variant.id === current.selection?.variantId ? current.state?.value ?? Object.freeze({}) : Object.freeze({}) }))
    const story = collected ? Object.freeze({ ...collected, variants }) : undefined
    const variant = variants?.find(variant => variant.id === current.selection?.variantId)
    return { route: router.currentRoute.value, currentStory: story, currentVariant: variant }
  }
  /** Reuse registered/builtin definitions; editor authority names collected target only. */
  function list(query: string): ClientCommand[] {
    if (!active.value) return []
    const current = context()
    const text = query.toLowerCase()
    return [...createBuiltinCommands(context, () => {}), ...registeredCommands].filter(command => (command.id === 'builtin:open-in-editor'
      ? Boolean(snapshot.value.selection && snapshot.value.capabilities.openInEditor.available)
      : !command.showIf || command.showIf(current)) && (command.label.toLowerCase().includes(text) || command.searchText?.toLowerCase().includes(text)))
  }
  /** Standalone adapts successful docs activation to its existing route and preserves other query preferences. */
  async function activateSearch(result: HistoireSearchResult): Promise<void> {
    const current = session.getSnapshot()
    if (!active.value || result.kind !== 'docs' || current.status !== 'ready' || current.stale || !current.selection || getHistoireTargetKey(current.selection) !== getHistoireTargetKey(result.target)) return
    const route = router.currentRoute.value
    await router.replace({ ...route, query: { ...route.query, tab: 'docs' }, hash: result.anchor ?? '' })
  }
  /** Only standalone publishes configured plugin commands over existing dev channel. */
  function execute(command: ClientCommand, params: Record<string, any>): Promise<unknown> {
    if (command.id === 'builtin:open-in-editor') {
      const target = session.getSnapshot().selection
      return actions.execute({ ...command, clientAction: () => target ? requestHistoireOpenInEditor(session, target) : undefined }, params, context())
    }
    return actions.execute(command, params, context(), () => {
      if (import.meta.hot) import.meta.hot.send('histoire:dev-command', { id: command.id, params })
    })
  }
  return { context, list, execute, activateSearch,
    /** Retire reactive publications and both callback/visibility subscriptions once. */
    close() {
      if (!active.value) return
      active.value = false
      stopSnapshot()
      actions.close()
      off?.()
    } }
}
