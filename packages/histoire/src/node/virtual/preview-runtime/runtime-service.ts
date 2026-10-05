import { projectVariantState } from '../../mcp/browser/inspection/state.js'

/** Emits finite runtime services inside existing preview app setup scope. */
export function previewRuntimeService() {
  return `    const inspectVariantState = ${projectVariantState.toString()}
    const runtimeStates = new Map()
    const runtimePresets = new Map()
    function getRuntimePresets(targetVariant) {
      let presets = runtimePresets.get(targetVariant)
      if (!presets) {
        const persistence = new URLSearchParams(window.location.search).get('standalone') === 'true' && !initialSelection.controls
          ? createStandalonePresetStorage(() => window.localStorage, { storyId: story.value.id, variantId: targetVariant.id })
          : undefined
        presets = createRuntimeStatePresets(() => targetVariant.state, value => toRawDeep(value, true), persistence,
          () => getRuntimeState(targetVariant).reset())
        runtimePresets.set(targetVariant, presets)
      }
      return presets
    }
    function getRuntimeState(targetVariant) {
      let state = runtimeStates.get(targetVariant)
      if (!state) {
        state = createRuntimeState(() => targetVariant.state, value => toRawDeep(value, true))
        runtimeStates.set(targetVariant, state)
      }
      return state
    }
    async function handleRuntimeRequest(message) {
      const targetVariant = getVariantById(message.variantId)
      if (message.storyId !== story.value?.id || !targetVariant || !readyVariantIds.has(targetVariant.id)) return
      const targetStory = story.value
      try {
        let result
        if (message.command === 'state.get' && message.inspection === true) {
          const query = new URLSearchParams(window.location.search)
          if (message.documentId !== previewDocumentId || message.mcpNonce !== query.get('mcpNonce') || message.mcpEpoch !== query.get('mcpEpoch')) return
          result = inspectVariantState(targetVariant.state)
        }
        else {
          const state = getRuntimeState(targetVariant)
          if (message.command === 'channel.post') {
            if (targetVariant.id !== variant.value?.id) throw Object.assign(new Error('Host channel selection changed'), { code: 'RUNTIME_CHANGED' })
            runtimeHostChannels.receive(message.payload, { storyId: targetStory.id, variantId: targetVariant.id })
            result = null
          }
          else if (message.command === 'state.get') result = state.get()
          else if (message.command === 'state.patch') result = state.patch(message.payload)
          else if (message.command === 'state.reset') {
            result = state.reset()
            getRuntimePresets(targetVariant).clearSelection()
          }
          else if (message.command === 'controls.preset') {
            result = getRuntimePresets(targetVariant).execute(message.payload)
          }
          else if (message.command === 'source.get') {
            try { result = await getDynamicSourceCode(targetStory, targetVariant) }
            catch (error) { throw Object.assign(new Error(error?.message ?? 'Dynamic source generation failed'), { code: 'INTERNAL_ERROR' }) }
            if (!result) throw Object.assign(new Error('Dynamic source unavailable'), { code: 'SOURCE_UNAVAILABLE' })
          }
          else throw new Error('Unknown runtime service')
        }
        if (story.value !== targetStory || getVariantById(targetVariant.id) !== targetVariant) return
        postToParent({ type: RUNTIME_RESULT, requestId: message.requestId, storyId: targetStory.id, variantId: targetVariant.id, result })
      }
      catch (error) {
        postToParent({ type: RUNTIME_RESULT, requestId: message.requestId, storyId: targetStory.id, variantId: targetVariant.id, error: { ...serializeTestError(error), ...(error?.code ? { code: error.code } : {}) } })
      }
    }
    const runtimeLayout = observeRuntimeLayout({
      getStoryId: () => story.value?.id,
      isReady: variantId => readyVariantIds.has(variantId),
      publish: viewports => postToParent({ type: RUNTIME_LAYOUT, storyId: story.value?.id, viewports }),
    })
    const runtimeHostChannels = installRuntimeHostChannels({
      enabled: Boolean(histoireConfig.embed?.enabled && histoireConfig.embed.channels?.length && !initialSelection.controls),
      names: histoireConfig.embed?.enabled && !initialSelection.controls ? histoireConfig.embed.channels ?? [] : [],
      documentId: previewDocumentId,
      storyId: () => story.value?.id,
      ready: target => target.storyId === story.value?.id && readyVariantIds.has(target.variantId),
      post: (channel, target) => postToParent({ type: HOST_CHANNEL_MESSAGE, channel, ...target }),
    })
    window.addEventListener('pagehide', () => runtimeHostChannels.close(), { once: true })
    const closeRuntimeEvents = installRuntimeEventScope(() => story.value?.id,
      new URLSearchParams(window.location.search).get('embed') === 'true'
        ? (focused, action) => postToParent({ type: RUNTIME_FOCUS, storyId: story.value?.id, variantId: variant.value?.id, focused, action })
        : undefined,
      message => postToParent(message))
    window.addEventListener('pagehide', closeRuntimeEvents, { once: true })
    window.addEventListener('pagehide', () => runtimeLayout.close(), { once: true })`
}
