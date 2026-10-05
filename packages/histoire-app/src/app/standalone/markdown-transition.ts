import type { HistoireSession } from '@histoire/sdk'
import { waitForHistoireSelection } from '@histoire/sdk/internal'
import { shallowRef } from 'vue'
import { samePageOwner } from '../components/pages/home/ownership.js'

/** Standalone Markdown must not unmount a primary while its selection ACK still owns it. */
export function createWorkbenchMarkdownTransition(session: HistoireSession) {
  const visible = shallowRef(false)
  let active = true
  let generation = 0
  let identity = ''
  /** Unrelated runtime/settings publications preserve one exact source/target transition. */
  function synchronize(snapshot: ReturnType<HistoireSession['getSnapshot']>) {
    const story = snapshot.catalog.stories.find(story => story.id === snapshot.selection?.storyId)
    const key = JSON.stringify([snapshot.status, snapshot.stale, snapshot.source, snapshot.selection, !!story?.docsOnly])
    if (key === identity) return
    identity = key
    const token = ++generation
    visible.value = false
    if (snapshot.status !== 'ready' || snapshot.stale || !story?.docsOnly) return
    if (!snapshot.runtime.mountId) {
      visible.value = true
      return
    }
    const owner = { source: snapshot.source, selection: snapshot.selection }
    // Selecting the document already published its tuple. Its old canvas must
    // finish the finite ACK before a conditional render releases that surface.
    /** Settled failures also release the old surface; the activation owner reports them. */
    function commit() {
      const current = session.getSnapshot()
      if (active && token === generation && current.status === 'ready' && !current.stale && samePageOwner(owner, current)) visible.value = true
    }
    void waitForHistoireSelection(session).then(commit, commit)
  }
  const stop = session.subscribe(synchronize)
  synchronize(session.getSnapshot())
  return {
    visible,
    /** Provider teardown retires pending layout completion without owning the SDK. */
    close() {
      active = false
      generation++
      stop()
    },
  }
}
