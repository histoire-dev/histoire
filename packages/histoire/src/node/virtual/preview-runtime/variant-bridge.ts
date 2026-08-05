/**
 * Emits the bridge between the mounted variants and the host: state snapshot
 * posting, the test run entry point and its error summary, the module-level
 * selection state, and the HMR listener that invalidates a changed story.
 */
export function previewVariantBridge() {
  return `function postVariantStateSnapshot(storyId, variant) {
  if (!variant) {
    return
  }

  postToParent({
    type: STATE_SYNC,
    // The host drops state messages tagged with another story: the iframe keeps
    // the same window across \`src\` navigations, so a dying document can still
    // post about the story the host already navigated away from.
    storyId,
    variantId: variant.id,
    state: toRawDeep(variant.state, true),
  })
}

function postVariantStateSnapshotById(story, variantId) {
  postVariantStateSnapshot(story?.id, story?.variants.find(item => item.id === variantId))
}

async function runVariantTests(storyFile, variant) {
  return await variantTestSession.runVariantTests(storyFile.id, variant.id)
}

if (import.meta.hot) {
  import.meta.hot.on(STORY_CHANGED_EVENT, ({ storyId }) => {
    if (!storyId) {
      return
    }

    invalidateStoryRuntime(storyId)
  })
}`
}
