import type { HistoireSession, HistoireTarget } from '@histoire/sdk'

/** Selection widget stores structured targets; IDs never get joined or parsed. */
export function addSelection(container: HTMLElement, session: HistoireSession, report: (error: unknown) => void) {
  const label = document.createElement('label')
  label.textContent = 'Story / variant '
  const select = document.createElement('select')
  select.setAttribute('aria-label', 'Story / variant')
  const targets: HistoireTarget[] = []
  const empty = document.createElement('option')
  empty.textContent = 'Choose story'
  empty.value = ''
  let epoch: string | undefined
  let revision: string | undefined
  /** Catalog publication and selection synchronization never emit another user edit. */
  function render(snapshot: ReturnType<HistoireSession['getSnapshot']>) {
    if (snapshot.source?.epoch !== epoch || snapshot.source?.revision !== revision) {
      epoch = snapshot.source?.epoch
      revision = snapshot.source?.revision
      targets.length = 0
      select.replaceChildren(empty)
      for (const story of snapshot.catalog.stories) {
        for (const variant of story.variants.length ? story.variants : [{ id: null, title: 'Docs' }]) {
          const option = document.createElement('option')
          option.value = String(targets.length)
          option.textContent = `${story.title} / ${variant.title}`
          targets.push({ storyId: story.id, variantId: variant.id })
          select.append(option)
        }
      }
    }
    const index = targets.findIndex(target => target.storyId === snapshot.selection?.storyId && target.variantId === snapshot.selection?.variantId)
    select.value = index < 0 ? '' : String(index)
    select.disabled = snapshot.status !== 'ready' || snapshot.stale
  }
  select.addEventListener('change', () => {
    if (select.value !== '') void session.selection.select(targets[Number(select.value)]).catch(report)
  })
  label.append(select)
  container.append(label)
  render(session.getSnapshot())
  return session.subscribe(render)
}
