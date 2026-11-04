import type { CatalogStoryDto, CatalogVariantDto } from '../protocol/catalog.js'
import type { TerminalViewFactory } from './registry.js'
import { createListNavigation } from '../navigation/list.js'
import { createSearchInput } from '../navigation/search.js'
import { sanitizeText } from '../output/sanitize.js'
import { getTestTargetHandoff } from '../stories/handoff.js'
import { catalogSegment, emptyStoriesText, storiesStatus, storyRow, variantRow, variantsStatus } from '../stories/render.js'
import { createStoriesState } from '../stories/state.js'
import { resolveTargetUrl } from '../stories/target.js'
import { fitWidth } from '../width.js'
import { renderViewFrame } from './frame.js'

/** Rows from the end of the loaded list at which the next page is requested. */
const LOAD_AHEAD = 10

/**
 * `p`: browse the canonical catalog. Enter on a story lists its variants, Enter on a variant
 * (or on a story without variants) opens it in the workbench; `o` opens the selection, `y`
 * copies its address, `t` opens the tests screen on the exact target, `/` searches the whole
 * catalog. Selection is kept by ID through revisions and restarts; a target the catalog no
 * longer confirms is not actionable.
 */
export const createStoriesView: TerminalViewFactory = (host) => {
  const state = createStoriesState({ bridge: host.bridge, progress: host.progress, changed: () => host.requestRender() })
  const handoff = getTestTargetHandoff(host)
  const stories = createListNavigation<CatalogStoryDto>({ id: story => story.id })
  const variants = createListNavigation<CatalogVariantDto>({ id: variant => variant.id })
  const search = createSearchInput()
  let level: 'stories' | 'variants' = 'stories'
  /** Story whose variant selection `variants` holds; another story starts at its first variant. */
  let variantsOf: string | undefined
  state.keepVisible(() => stories.selectedId(), () => variants.selectedId(), id => stories.select(id))
  host.addPanelSegment(() => catalogSegment(state.view().catalog))

  /** Pushes loaded rows into the navigation; selection follows IDs. */
  function sync() {
    stories.setItems(state.view().stories)
    variants.setItems(state.variants().variants)
  }

  /** Story under the cursor, only while the current catalog confirms it. */
  function story() {
    sync()
    return stories.selectedItem()
  }

  /** Selected story/variant with what is needed to act on it, or why not. */
  function target(): { story: CatalogStoryDto, variant?: ReturnType<typeof variants.selectedItem> } | string {
    const selected = story()
    if (!selected) return 'Selected story is not in the catalog'
    if (level === 'stories') return { story: selected }
    const variant = variants.selectedItem()
    return variant ? { story: selected, variant } : 'Selected variant is not in the catalog'
  }

  /** Opens the target in the workbench or says why it cannot be opened. */
  async function open() {
    const selection = target()
    if (typeof selection === 'string') return host.notify(selection)
    const resolved = await resolveTargetUrl({ publicUrl: host.url(), workbench: state.view().workbench, ...selection })
    if ('problem' in resolved) return host.notify(resolved.problem)
    host.notify(`Opening ${selection.variant?.title ?? selection.story.title}`)
    void host.openBrowser(resolved.url).catch(error => host.notify(`Failed: ${error instanceof Error ? error.message : String(error)}`))
  }

  /** Copies the workbench address of the selection. */
  async function copy() {
    const selection = target()
    if (typeof selection === 'string') return host.notify(selection)
    const resolved = await resolveTargetUrl({ publicUrl: host.url(), workbench: state.view().workbench, ...selection })
    if ('problem' in resolved) return host.notify(resolved.problem)
    void host.copy(resolved.url).then(result => host.notify(result.ok ? `Copied address${result.note ? ` (${result.note})` : ''}` : `Copy unavailable: ${result.reason}. Address is not shown`))
  }

  /** Hands the exact story or variant to the tests screen and runs it. Executable targets only. */
  function test() {
    const selection = target()
    if (typeof selection === 'string') return host.notify(selection)
    const { revision, generation } = state.view()
    if (!revision || !generation) return host.notify('Catalog is not ready')
    if (selection.story.ambiguous || selection.variant?.ambiguous) return host.notify('Target ID is shared, it cannot be tested')
    if (selection.story.docsOnly || selection.story.variantCount === 0) return host.notify('This story has no variants to test')
    const label = selection.variant ? `${selection.story.title} / ${selection.variant.title}` : selection.story.title
    handoff.set({ target: selection.variant ? { scope: 'variant', storyId: selection.story.id, variantId: selection.variant.id } : { scope: 'story', storyId: selection.story.id }, label, storyLabel: selection.story.title, revision, generation })
    // The handoff retargets the tests scope synchronously, so the run below uses exactly this target.
    host.openView('t')
    void host.tests.run().then(result => host.notify('problem' in result ? result.problem : 'Tests queued'))
  }

  /** Enter: story with variants lists them; anything else opens in the workbench. */
  function activate() {
    const selected = story()
    if (level === 'variants' || !selected || selected.ambiguous || selected.docsOnly || selected.variantCount === 0) return void open()
    level = 'variants'
    if (variantsOf !== selected.id) variants.select(undefined)
    variantsOf = selected.id
    state.openStory(selected.id)
  }

  /** Requests the next page when the cursor nears the end of what is loaded. */
  function loadAhead() {
    const view = state.view()
    const loaded = level === 'stories' ? view.stories : state.variants().variants
    const index = loaded.findIndex(item => item.id === (level === 'stories' ? stories : variants).selectedId())
    if (index >= loaded.length - LOAD_AHEAD) void (level === 'stories' ? state.moreStories() : state.moreVariants())
  }

  return {
    id: 'stories',
    shortcut: 'p',
    title: 'Stories',
    enter() {
      level = 'stories'
      state.openStory(undefined)
      state.refresh()
    },
    leave() {
      level = 'stories'
      state.openStory(undefined)
    },
    capturesInput: () => level === 'stories' && search.active(),
    handleKey(key) {
      if (level === 'stories' && search.handleKey(key)) {
        state.search(search.applied())
        return true
      }
      if (key.name === 'escape' && level === 'variants') {
        level = 'stories'
        state.openStory(undefined)
        return true
      }
      sync()
      if ((level === 'stories' ? stories : variants).handleKey(key, Math.max(1, host.size().rows - 5))) {
        loadAhead()
        return true
      }
      if (key.name === 'return') activate()
      else if (key.char === 'o') void open()
      else if (key.char === 'y') void copy()
      else if (key.char === 't') test()
      else if (key.char === 'u') state.refresh()
      else return false
      return true
    },
    render(size) {
      sync()
      const view = state.view()
      const opened = state.variants()
      const selectedId = (level === 'stories' ? stories : variants).selectedId()
      const header = level === 'stories' ? storiesStatus(view) : variantsStatus(stories.selectedItem(), opened, view.catalog?.updating === true)
      const height = Math.max(1, size.rows - 4)
      const rows = level === 'stories'
        ? stories.window(height).items.map(item => storyRow(item, item.id === selectedId, size.columns))
        : variants.window(height).items.map(item => variantRow(item, item.id === selectedId, size.columns))
      const body = [header, ...rows]
      if (!rows.length) body.push(`  ${level === 'stories' ? emptyStoriesText(view, selectedId !== undefined) : opened.status === 'failed' ? `Variants unavailable: ${opened.problem ?? 'unknown reason'}` : opened.status === 'ready' ? 'No variants' : 'Loading variants'}`)
      else if (selectedId !== undefined && (level === 'stories' ? stories : variants).selectedItem() === undefined) body.push(`  Selected ${level === 'stories' ? 'story' : 'variant'} is not in the catalog`)
      const footer = search.active()
        ? `/${search.text()}▏`
        : fitWidth(level === 'stories' ? 'Up/Down · Enter variants · o open · y copy address · t test · / search · u refresh · Esc back' : 'Up/Down · Enter open · o open · y copy address · t test · u refresh · Esc stories', size.columns)
      return renderViewFrame({ title: level === 'stories' ? 'Stories' : `Stories · ${sanitizeText(stories.selectedItem()?.title ?? stories.selectedId() ?? '')}`, body, footer, ...size })
    },
  }
}
