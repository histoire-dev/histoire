import type { HistoireTarget } from '@histoire/protocol'
import type { Router } from 'vue-router'
import type { createStandaloneSelection } from './selection.js'
import { resolveStoryRouteId, resolveStoryRouteSelection, STORY_ROUTE_PATH } from '@histoire/protocol'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { normalizeSettingsSection } from '../stores/settings.js'

/** Each standalone bootstrap explicitly owns its router adapter; reusable parts never import it. */
export function createStandaloneNavigation(selection: ReturnType<typeof createStandaloneSelection>, options: { base: string, mode: 'history' | 'hash', error: (error: unknown) => void, dev?: boolean }) {
  const router: Router = createRouter({
    history: options.mode === 'hash' ? createWebHashHistory(options.base) : createWebHistory(options.base),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
      { path: STORY_ROUTE_PATH, name: 'story', component: { render: () => null } },
      { path: '/settings/:section?', name: 'settings', component: { render: () => null } },
    ],
  })
  const stopGuard = router.beforeEach((route) => {
    if (route.name !== 'settings') return
    const section = normalizeSettingsSection(route.params.section, options.dev ?? false)
    if (section !== route.params.section) return { name: 'settings', params: { section }, replace: true }
  })
  let active = true
  let generation = 0
  let routeSelections = 0
  let pendingTarget: string | null = null
  /** Preserve exact IDs and explicit null (`?variantId`); omitted URLs still use remembered/chooser resolution. */
  function location(target: HistoireTarget) {
    const dot = /^\.+$/.test(target.storyId)
    const route = router.currentRoute.value
    const query = route.name === 'story' && resolveStoryRouteId(route.params, route.query) === target.storyId ? route.query : {}
    return { name: 'story', params: dot ? {} : { storyId: target.storyId }, query: { ...query, ...(dot ? { storyId: target.storyId } : {}), variantId: target.variantId } }
  }
  selection.setNavigate((target, link) => {
    const next = location(target)
    return router.push({ ...next, query: { ...next.query, ...(link?.panel === undefined ? {} : { tab: link.panel }) }, hash: link?.anchor ?? '' })
  })
  /** Runtime-originated grid selection bypasses facade, but still owns local URL. */
  const stopSelection = selection.session.subscribe((snapshot) => {
    const target = snapshot.selection
    const route = router.currentRoute.value
    if (!active || routeSelections || selection.isNavigating() || snapshot.status !== 'ready' || !target || route.name !== 'story') return
    const storyId = resolveStoryRouteId(route.params, route.query)
    if (storyId === target.storyId && route.query.variantId === target.variantId) return
    const key = JSON.stringify([snapshot.source, target])
    if (pendingTarget === key) return
    pendingTarget = key
    const next = location(target)
    void router.push({ ...next, query: { ...route.query, ...next.query } }).catch((error) => {
      if (!active || pendingTarget !== key) return
      const current = selection.session.getSnapshot()
      if (current.status === 'ready' && JSON.stringify([current.source, current.selection]) === key) options.error(error)
    }).finally(() => {
      if (pendingTarget === key) pendingTarget = null
    })
  })
  /** User back/forward/deep links apply one selection, with no test/state replay. */
  async function synchronize() {
    const route = router.currentRoute.value
    const input = resolveStoryRouteSelection(route.params, route.query)
    if (!input) return
    const token = ++generation
    routeSelections++
    try {
      const raw = route.query.variantId
      const target = await selection.fromRoute(input)
      if (!active || token !== generation || router.currentRoute.value !== route) return
      if (target.variantId !== null && raw !== target.variantId) await router.replace({ ...route, query: { ...route.query, variantId: target.variantId } })
    }
    catch (error) {
      if (active && token === generation) options.error(error)
    }
    finally { routeSelections-- }
  }
  const off = router.afterEach(() => {
    void synchronize()
  })
  return { router, synchronize,
    /** Resolve exact target links through current hash/history route contract. */
    href(target: HistoireTarget) { return router.resolve(location(target)).href },
    /** Workbench query additions retain story identity and existing tabs. */
    query(value: Record<string, string>) { return router.replace({ ...router.currentRoute.value, query: { ...router.currentRoute.value.query, ...value } }) },
    /** Caller panel routing keeps story identity and current URL history mode. */
    panel(value: string) {
      return router.replace({ ...router.currentRoute.value, query: { ...router.currentRoute.value.query, tab: value } })
    }, close() {
      active = false
      generation++
      stopGuard()
      off()
      stopSelection()
      router.options.history.destroy()
    } }
}
