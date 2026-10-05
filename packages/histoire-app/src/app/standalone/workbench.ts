import type { HistoireTarget } from '@histoire/protocol'
import type { ProjectConfigState } from '../stores/project-config.js'
import type { ShortcutScope } from '../util/shortcuts.js'
import type { WorkbenchCanvas, WorkbenchProps } from './workbench-types.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { HISTOIRE_SEARCH_FOCUS, useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { getRegisteredFrameTarget } from '../components/canvas/frame-target.js'
import { createSearchFrameNavigation } from '../components/panes/search/frame-navigation.js'
import { createDevWorkbenchTestsOptions } from '../components/panes/tests/dev-runner.js'
import { createWorkbenchTestsModel, provideWorkbenchTestsModel } from '../components/panes/tests/model.js'
import { createContextMenu, provideContextMenu } from '../composables/context-menu.js'
import { provideShell } from '../composables/shell.js'
import { createMatrixStore, provideMatrix } from '../stores/matrix.js'
import { createMcpStore, provideMcpStore } from '../stores/mcp.js'
import { createPresetConfigStore, providePresetConfigStore } from '../stores/presets-config.js'
import { createProjectConfigStore, provideProjectConfigStore } from '../stores/project-config.js'
import { createUiSettingsStore, provideUiSettingsStore } from '../stores/settings.js'
import { createShell } from '../stores/shell.js'
import { histoireConfig } from '../util/config.js'
import { createFrameActions, provideFrameActions } from '../util/frame-actions.js'
import { createShortcutRegistry, provideShortcutRegistry } from '../util/shortcuts.js'
import { onUiEvent, sendUiEvent } from '../util/ui-channel.js'
import { resolveWorkbenchArrangement } from './arrangement.js'
import { createWorkbenchMarkdownTransition } from './markdown-transition.js'
import { useWorkbenchDev } from './workbench-dev.js'

/** Bind standalone adapters once, keeping every store owned by this provider. */
export function useWorkbench(props: WorkbenchProps, error: (error: unknown) => void) {
  const context = useHistoireContext()
  const snapshot = useHistoireSnapshot()
  const route = props.navigation.router.currentRoute
  let storage: Storage | undefined
  try {
    storage = props.hostWindow.localStorage
  }
  catch { /* Memory-only workbench remains usable when storage is blocked. */ }
  const shell = createShell({ dev: __HISTOIRE_DEV__, storage })
  provideShell(shell)
  useHistoireResource(shell.close)
  const settings = createUiSettingsStore({ storage, warn: console.warn })
  provideUiSettingsStore(settings)
  const presets = createPresetConfigStore({ storage, config: () => histoireConfig, warn: console.warn })
  providePresetConfigStore(presets)
  const matrix = createMatrixStore({ storage })
  provideMatrix(matrix)
  useHistoireResource(matrix.close)
  watch(() => [snapshot.value.status, snapshot.value.stale, snapshot.value.runtime, snapshot.value.selection, snapshot.value.source, snapshot.value.catalog.stories, snapshot.value.state, route.value.query.rows, route.value.query.cols], () => matrix.synchronize(snapshot.value, {
    rows: typeof route.value.query.rows === 'string' ? route.value.query.rows : undefined,
    cols: typeof route.value.query.cols === 'string' ? route.value.query.cols : undefined,
  }), { immediate: true })
  const projectTests = createWorkbenchTestsModel(props.session, props.tests, {
    ...(__HISTOIRE_DEV__ ? createDevWorkbenchTestsOptions(props.hostWindow) : {}),
    settings,
  })
  provideWorkbenchTestsModel(projectTests)
  useHistoireResource(projectTests.close)
  let projectStorage: Storage | undefined
  try {
    projectStorage = props.hostWindow.sessionStorage
  }
  catch { /* Receipt recovery stays memory-only when session storage is denied. */ }
  const project = __HISTOIRE_DEV__ ? createProjectConfigStore({ send: sendUiEvent, subscribe: listener => onUiEvent<ProjectConfigState>('histoire:ui:config-state', listener) }, { storage: projectStorage, key: `_histoire-ui-project-save:${props.previewBase}` }) : undefined
  if (project) {
    provideProjectConfigStore(project)
    useHistoireResource(project.close)
  }
  const mcp = __HISTOIRE_DEV__ ? createMcpStore(target => props.session.selection.select(target)) : undefined
  if (mcp) {
    provideMcpStore(mcp)
    mcp.connect()
    useHistoireResource(mcp.close)
  }
  const menu = createContextMenu()
  provideContextMenu(menu)
  const canvas = ref<WorkbenchCanvas>()
  const actions = createFrameActions({
    session: props.session,
    link: target => new URL(props.navigation.href(target), props.hostWindow.location.href).href,
    reveal: async (target) => {
      await props.session.selection.select(target)
      showPane('stories')
    },
    frameSession: target => canvas.value?.registry.getFrame(target.frameKey)?.session ?? null,
    error,
  })
  provideFrameActions(actions)
  const dev = __HISTOIRE_DEV__
    ? useWorkbenchDev({
        session: props.session,
        canvas,
        actions,
        navigate: target => props.session.selection.select(target),
        showComments: () => showPane('comments'),
        setupAgents: () => navigate('settings', 'agents'),
        error,
      })
    : undefined
  const search = ref<{ focus: () => void | Promise<void>, search: (query: string) => void }>()
  const highlighted = ref<string[]>([])
  const searchQuery = ref('')
  const shortcuts = createShortcutRegistry()
  provideShortcutRegistry(shortcuts)
  useHistoireResource(shortcuts.bind('global.search', () => openSearch(), { allowInput: true }))
  const story = computed(() => snapshot.value.catalog.stories.find(item => item.id === snapshot.value.selection?.storyId))
  const markdownTransition = createWorkbenchMarkdownTransition(props.session)
  useHistoireResource(markdownTransition.close)
  const arrange = computed(() => resolveWorkbenchArrangement(route.value.query.arrange, story.value?.layout?.type, settings.defaultArrange.value, histoireConfig.ui?.defaultArrange))
  const searchActive = computed(() => Boolean(searchQuery.value.trim() && !searchQuery.value.startsWith('>') && snapshot.value.status === 'ready' && !snapshot.value.stale))
  const searchMatches = createSearchFrameNavigation({
    getStory: () => story.value,
    getMatches: () => highlighted.value,
    // Ordinary search tuples cannot distinguish matrix prop overrides.
    isActive: () => searchActive.value && arrange.value !== 'matrix',
    getOwner: () => JSON.stringify([searchQuery.value, snapshot.value.source?.sourceId, snapshot.value.source?.epoch, snapshot.value.source?.revision, story.value?.id, arrange.value]),
    getSelected: () => snapshot.value.selection ? getHistoireTargetKey(snapshot.value.selection) : undefined,
    reveal: (key) => {
      const entry = canvas.value?.registry.getFrame(key)
      if (!entry || entry.storyId !== story.value?.id || key !== getHistoireTargetKey(entry)) return false
      canvas.value!.canvas.revealFrame({ id: key, storyId: entry.storyId, variantId: entry.variantId, ...entry.rect })
      return true
    },
  })
  useHistoireResource(searchMatches.close)
  const badges = computed(() => ({ tests: projectTests.summary.value.failed, mcp: mcp?.running.length ?? 0, comments: dev?.comments.count.value ?? 0 }))
  watch(() => route.value.name, (name, previousName) => {
    if (name === 'settings') {
      shell.selectPane('home')
    }
    else if (name === 'home') {
      // Initial route resolution retains restored pane and visibility preferences.
      if (previousName !== undefined) showPane('stories')
    }
    else if (name === 'story' && shell.pane.value === 'home') {
      showPane('stories')
    }
  }, { immediate: true })
  let root: HTMLElement | null = null
  /** Frame shortcuts require exact registered chrome/menu; other panes retain globals only. */
  function shortcutScopes(target: Element): readonly ShortcutScope[] {
    if (route.value.name !== 'story' || story.value?.docsOnly) return ['global']
    const registry = canvas.value?.registry
    const selection = snapshot.value.selection
    const frame = selection?.variantId != null ? registry?.getFrame(getHistoireTargetKey(selection)) : null
    const menuTarget = target.closest('.histoire-context-menu, .histoire-submenu-panel') && menu.state.target
    const chromeTarget = registry ? getRegisteredFrameTarget(target, registry) : null
    const canonicalDocument = frame?.iframe && root?.ownerDocument.activeElement === frame.iframe
    const inCanvas = Boolean(target.closest('.histoire-canvas-viewport') || canonicalDocument)
    const inFrame = Boolean((menuTarget && registry?.getFrame(menuTarget.frameKey)) || chromeTarget)
    const scopes: ShortcutScope[] = []
    if (inFrame) scopes.push('frame')
    if (inCanvas) scopes.push('canvas')
    scopes.push('global')
    return scopes
  }
  /** Keyboard scope belongs to exact provider; nested embeds retain their bindings. */
  function keydown(event: KeyboardEvent) {
    const target = event.target as Element | null
    if (!root || !target?.closest || target.closest('.histoire-provider') !== root) return
    shortcuts.handle(event, shortcutScopes(target), __HISTOIRE_DEV__)
  }
  /** Current owned iframe search intent reveals a pane even before its input exists. */
  function requestSearch(event: Event) {
    if (event.target !== root) return
    event.preventDefault()
    void openSearch().catch(error)
  }
  onMounted(() => {
    root = context.root.value
    root?.addEventListener('keydown', keydown)
    root?.addEventListener(HISTOIRE_SEARCH_FOCUS, requestSearch)
  })
  useHistoireResource(() => {
    root?.removeEventListener('keydown', keydown)
    root?.removeEventListener(HISTOIRE_SEARCH_FOCUS, requestSearch)
  })
  /** Open without toggling an already visible pane closed. */
  function showPane(pane: 'stories' | 'search' | 'tests' | 'comments' | 'mcp') {
    if (shell.pane.value !== pane || !shell.panelOpen.value) shell.selectPane(pane)
  }
  /** Search rail and keyboard entry share one input and one source index. */
  async function openSearch() {
    showPane('search')
    await nextTick()
    await search.value?.focus()
  }
  /** Escape closes only active Search and restores focus to this provider's rail. */
  function closeSearch() {
    if (shell.pane.value !== 'search' || !shell.panelOpen.value) return
    shell.togglePanel()
  }
  /** Route-only mutation preserves canonical session and runtime ownership. */
  function panel(value: string) {
    void props.navigation.panel(value).catch(error)
  }
  /** Additive arrangement URL rejects unknown values at read time. */
  function setArrange(value: 'grid' | 'list' | 'matrix') {
    void props.navigation.query({ arrange: value }).catch(error)
  }
  /** Matrix axes remain URL-restorable without inventing variant IDs. */
  function setAxes(value: { rows: string, cols: string }) {
    void props.navigation.query(value).catch(error)
  }
  /** Home always reveals Stories, including navigation to an already active Home route. */
  function navigate(name: 'home' | 'settings', section?: string) {
    if (name === 'home') showPane('stories')
    void props.navigation.router.push({ name, params: section ? { section } : {} }).catch(error)
  }
  /** Search's canonical activation preserves the docs anchor contract. */
  function searchSelected() {
    shell.closePanelAfterSelection()
  }
  /** Project-wide results activate existing inspector test tab. */
  function testsSelected() {
    panel('tests')
    if (!shell.inspectorOpen.value) shell.toggleInspector()
    shell.closePanelAfterSelection()
  }
  /** Run-all action reuses aggregate controller and server lane. */
  function runAll() {
    showPane('tests')
    void projectTests.runAll().catch(error)
  }
  /** Native isolated view links share current source base and exact target IDs. */
  function openIsolated(target: HistoireTarget) {
    const action = actions.entries.get('open-isolated')
    if (action && target.variantId) void actions.run(action, { ...target, variantId: target.variantId, frameKey: getHistoireTargetKey(target) })
  }
  return { snapshot, route, shell, settings, presets, matrix, projectTests, project, mcp, dev, menu, actions, canvas, search, searchQuery, searchActive, searchMatches, highlighted, story, markdown: markdownTransition.visible, arrange, badges, showPane, openSearch, closeSearch, panel, setArrange, setAxes, navigate, searchSelected, testsSelected, nextMatch: searchMatches.next, previousMatch: searchMatches.previous, runAll, openIsolated }
}
