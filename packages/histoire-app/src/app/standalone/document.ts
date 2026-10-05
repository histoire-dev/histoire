import type { HistoireSession } from '@histoire/sdk/internal'

/** Standalone explicitly owns document title/appearance; native embeds never install this adapter. */
export function installStandaloneDocument(session: HistoireSession, document: Document, isStoryRoute: () => boolean, title: string) {
  const previous = { title: document.title, dark: document.documentElement.classList.contains('htw-dark'), dir: document.documentElement.getAttribute('dir') }
  const media = document.defaultView?.matchMedia('(prefers-color-scheme: dark)')
  /** Settings and catalog identity remain separate from host-owned story modules. */
  function synchronize() {
    const snapshot = session.getSnapshot()
    const story = isStoryRoute() && snapshot.catalog.stories.find(story => story.id === snapshot.selection?.storyId)
    const variant = story && story.variants.find(variant => variant.id === snapshot.selection?.variantId)
    document.title = story ? `${story.title}${variant ? ` › ${variant.title}` : ''} | ${title}` : title
    const dark = snapshot.settings.colorScheme === 'dark' || (snapshot.settings.colorScheme === 'auto' && media?.matches)
    document.documentElement.classList.toggle('htw-dark', Boolean(dark))
    document.documentElement.setAttribute('dir', snapshot.settings.textDirection)
  }
  const off = session.subscribe(synchronize)
  media?.addEventListener('change', synchronize)
  synchronize()
  return { synchronize,
    /** Restore caller's document state when explicit standalone mount is removed. */
    close() {
      off()
      media?.removeEventListener('change', synchronize)
      document.title = previous.title
      document.documentElement.classList.toggle('htw-dark', previous.dark)
      if (previous.dir === null) document.documentElement.removeAttribute('dir')
      else document.documentElement.setAttribute('dir', previous.dir)
    } }
}
