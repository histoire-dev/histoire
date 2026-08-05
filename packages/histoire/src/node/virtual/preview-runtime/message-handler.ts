/**
 * Emits the inbound `message` listener installed by the preview app: the
 * origin/source guard followed by the dispatch over PREVIEW_SYNC, STATE_SYNC,
 * PREVIEW_SETTINGS_SYNC, SELECT_VARIANT, COLLECT_TESTS and RUN_TESTS.
 *
 * Emitted at the indentation of the app `setup()` body — it is spliced inside
 * it by {@link previewApp}.
 */
export function previewMessageHandler() {
  return `    window.addEventListener('message', async (event) => {
      // Defense-in-depth, applied uniformly to every message type: the host
      // posts same-origin messages from window.parent, all carrying the
      // __histoire marker. Anything from a foreign frame or origin, or without
      // the marker, is dropped before it reaches the dispatch below.
      if (event.source !== window.parent) return
      if (event.origin && event.origin !== window.location.origin) return
      if (!event.data?.__histoire) return

      try {
        await handlePreviewMessage(event)
      }
      catch (error) {
        // Every branch is guarded, not just the selection one: an error while
        // applying a state or a settings message would otherwise escape this
        // async listener as an unhandled rejection and paint the error overlay
        // over an otherwise healthy preview.
        console.error(error)
      }
    })

    async function handlePreviewMessage(event) {
      if (event.data?.type === PREVIEW_SYNC) {
        try {
          await syncSelection(event.data)
        }
        catch (error) {
          // A failed selection (story that stayed unknown after the reload
          // guard) must not escape the message listener as an unhandled
          // rejection; the host times out and shows its own error state.
          console.error(error)
          return
        }
        postVariantStateSnapshot(story.value?.id, variant.value)
        postToParent({ type: SANDBOX_READY, storyId: story.value?.id, variantId: variant.value?.id })
      }
      else if (event.data?.type === STATE_SYNC) {
        if (mounted) {
          applyVariantStateUpdate({
            storyId: story.value?.id ?? selection.storyId,
            variantId: event.data.variantId,
            state: event.data.state,
            getVariantById,
            guards: variantStateGuards,
          })
        }
      }
      else if (event.data?.type === PREVIEW_SETTINGS_SYNC) {
        if (selection.grid) {
          Object.assign(previewSettingsStore.currentSettings, event.data.settings)
        }
        else {
          applyPreviewSettings(event.data.settings)
        }
      }
      else if (event.data?.type === SELECT_VARIANT) {
        gridSelectedVariantId.value = event.data.variantId
      }
      else if (event.data?.type === COLLECT_TESTS) {
        const requestId = event.data?.requestId
        const variantKey = event.data?.variantKey

        if (!story.value || !variant.value) {
          setCollectedTestDefinitions([])
          // Answer with the key of what is actually selected (nothing), never
          // with the requested one: echoing it would report "this variant has
          // no tests" for a variant that was never collected. A host request
          // scoped to a variant sees the mismatch and re-issues it once the
          // preview caught up with the selection.
          postToParent({
            type: TEST_DEFINITIONS,
            requestId,
            variantKey: null,
            definitions: [],
          })
          return
        }

        // Capture the selection synchronously. The await below can span a
        // SELECT_VARIANT/PREVIEW_SYNC message that flips story/variant, so
        // re-reading story.value/variant.value afterwards would tag the reply
        // with the variant we did NOT collect. The host matches replies by this
        // key against its pending request and drops mismatches — a stale key
        // there stalls the request until the 15s timeout instead of resolving it.
        const collectedStoryId = story.value.id
        const collectedVariantId = variant.value.id

        try {
          const definitions = await variantTestSession.collectVariantTests(collectedStoryId, collectedVariantId)
          // Only publish as the current definitions global when the selection did
          // not change while collecting, so we never surface another variant's
          // tests as the active ones.
          if (story.value?.id === collectedStoryId && variant.value?.id === collectedVariantId) {
            setCollectedTestDefinitions(definitions)
          }
          // Tag the reply with the key of the variant that was actually
          // collected (captured before the await), so the host files it against
          // the matching request instead of ignoring a stale-keyed reply.
          postToParent({
            type: TEST_DEFINITIONS,
            requestId,
            variantKey: \`\${collectedStoryId}:\${collectedVariantId}\`,
            definitions,
          })
        }
        catch (error) {
          console.error(error)
          setCollectedTestDefinitions([])
          postToParent({
            type: TEST_DEFINITIONS,
            requestId,
            variantKey,
            definitions: [],
            // Lets the host UI distinguish "no tests registered" from a
            // crashed collection (e.g. a story module that fails to load).
            error: serializeTestError(error),
          })
        }
      }
      else if (event.data?.type === RUN_TESTS) {
        const variantKey = event.data?.variantKey
        if (!story.value || !variant.value) {
          // Same as the collection branch: tagged with what is selected (
          // nothing), so a variant-scoped request retries instead of taking
          // this failure as its own variant's result.
          postToParent({
            type: TEST_RESULT,
            runId: event.data.runId,
            variantKey: null,
            summary: createFailedRunSummary('unknown', 'unknown', new Error('Could not run tests. No active story/variant is selected.')),
          })
          return
        }

        // Capture the selection synchronously so a variant swap during the run
        // cannot re-tag the reply with the wrong key. A mismatched key is dropped
        // by the host, stalling the request until timeout and escalating to the
        // heavy node-side vitest browser fallback despite a valid iframe result.
        const runStory = story.value
        const runVariant = variant.value
        try {
          const summary = await runVariantTests(runStory, runVariant)
          // Tag the reply with the key of the variant that was actually run
          // (captured before the await), so the host files it against the
          // matching request instead of ignoring a stale-keyed reply.
          postToParent({ type: TEST_RESULT, runId: event.data.runId, variantKey: \`\${runStory.id}:\${runVariant.id}\`, summary })
        }
        catch (error) {
          postToParent({
            type: TEST_RESULT,
            runId: event.data.runId,
            variantKey,
            summary: createFailedRunSummary(runStory.id, runVariant.id, error),
          })
        }
      }
    }`
}
