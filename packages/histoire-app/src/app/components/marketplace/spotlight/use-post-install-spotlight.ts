import type { PluginDetail } from '@histoire/shared'
import type { AnchoredSpotlightTarget } from './use-spotlight-targets.js'
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { workbenchPluginId } from '../shell/workbench-plugin-id.js'
import { useSpotlightTargets } from './use-spotlight-targets.js'

/** Own one install tour, with receipt acknowledgement and visit-fenced asynchronous reads. */
export function usePostInstallSpotlight() {
  const store = useMarketplaceStore()
  const pluginId = ref<string>()
  const detail = shallowRef<PluginDetail>()
  const { workbench, root, ready, targets, anchorFor } = useSpotlightTargets(pluginId, detail)
  const active = ref(false)
  const index = ref(0)
  const revision = ref(0)
  const running = ref(false)
  const error = ref<string>()
  const receipt = ref<string>()
  const acknowledged = new Set<string>()
  let controller: AbortController | undefined
  let opener: HTMLElement | undefined
  let frame: number | undefined
  const prefix = `_histoire-marketplace-spotlight:${import.meta.env.BASE_URL}:`
  const eligible = computed(() => {
    const job = store.job.value
    return job?.kind === 'install' && job.status === 'succeeded' && job.steps.some(step => step.id === 'load' && step.state === 'done') ? job : undefined
  })
  const anchored = computed<AnchoredSpotlightTarget[]>(() => {
    void revision.value
    return targets.value.flatMap((target) => {
      const anchor = anchorFor(target)
      return anchor ? [{ ...target, anchor }] : []
    })
  })
  const target = computed(() => anchored.value[Math.min(index.value, anchored.value.length - 1)])
  const page = computed(() => target.value ? anchored.value.indexOf(target.value) + 1 : 0)
  const total = computed(() => anchored.value.length)
  const name = computed(() => detail.value?.displayName ?? eligible.value?.id ?? 'Plugin')
  /** Read persisted acknowledgements without making restricted storage a fatal error. */
  function seen(jobId: string): boolean {
    if (acknowledged.has(jobId)) return true
    try {
      return localStorage.getItem(prefix + jobId) === 'acknowledged'
    }
    catch { return false }
  }
  /** Close this tour and restore its originating workbench control when still connected. */
  function hide(): void {
    if (!active.value) return
    active.value = false
    const previous = opener
    void nextTick(() => {
      if (!active.value && previous?.isConnected) previous.focus()
    })
  }
  watch([() => eligible.value?.jobId, ready], async ([, settled], _, cleanup) => {
    const job = eligible.value
    controller?.abort()
    hide()
    receipt.value = undefined
    running.value = false
    if (!job || !settled || seen(job.jobId)) return
    const visit = controller = new AbortController()
    cleanup(() => visit.abort())
    pluginId.value = undefined
    detail.value = undefined
    const destination = store.postInstall.value?.jobId === job.jobId ? store.postInstall.value.openPane : undefined
    // Metadata supplies copy only. A failed/late catalog read cannot fabricate an anchor.
    const metadata = store.client.detail(job.id, store.prefs.value, { signal: visit.signal, timeoutMs: 3000 }).catch(() => undefined)
    try {
      const id = await workbenchPluginId(job.id)
      if (visit.signal.aborted) return
      pluginId.value = id
    }
    catch { /* Missing inventory leaves the honest unanchored fallback. */ }
    const result = await metadata
    if (visit.signal.aborted) return
    detail.value = result
    // Capture before modal closure restores its opener; spotlight then gets focus after it.
    opener = store.open.value ? store.opener.value : document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    store.close()
    await nextTick()
    if (visit.signal.aborted) return
    const panes = targets.value.filter(item => item.kind === 'rail-pane')
    const pane = destination ? panes.find(item => item.id === `${pluginId.value}:${destination}`) : undefined
    // Wizard may already have opened and acknowledged this destination during metadata loading.
    if (pane && store.postInstall.value?.jobId === job.jobId) workbench?.context.navigation.openPane(pane.id)
    await nextTick()
    if (visit.signal.aborted) return
    revision.value++
    index.value = pane ? Math.max(0, anchored.value.findIndex(item => item.id === pane.id)) : 0
    receipt.value = job.jobId
    error.value = undefined
    active.value = true
  }, { immediate: true, flush: 'sync' })
  /** Acknowledge only the displayed receipt, leaving any newer store destination intact. */
  function dismiss(): void {
    const jobId = receipt.value
    if (!jobId) return
    acknowledged.add(jobId)
    try {
      localStorage.setItem(prefix + jobId, 'acknowledged')
    }
    catch { /* In-memory acknowledgement remains valid for this workbench lifetime. */ }
    store.acknowledgePostInstall(jobId)
    hide()
  }
  /** Advance among anchors still rendered now, skipping hidden or removed controls. */
  function next(): void {
    index.value = Math.min(index.value + 1, total.value - 1)
    error.value = undefined
  }
  /** Navigate through existing validated settings service, then acknowledge the receipt. */
  function openSettings(): void {
    workbench?.context.navigation.openSettings('builtin:plugins')
    dismiss()
  }
  /** Execute only the current explicit command through the host's owned action runner. */
  async function run(): Promise<void> {
    const command = target.value?.command
    if (!command || !workbench || running.value) return
    const owner = receipt.value
    running.value = true
    error.value = undefined
    try {
      await workbench.run(command.id)
    }
    catch {
      if (receipt.value === owner && active.value) error.value = 'Could not run command'
    }
    finally {
      if (receipt.value === owner) running.value = false
    }
  }
  /** Recheck anchors when layout or surface availability changes without registry changes. */
  function refresh(): void {
    frame ??= requestAnimationFrame(() => {
      frame = undefined
      revision.value++
    })
  }
  /** Escape dismisses even after keyboard focus moves back to a highlighted control. */
  function onKeydown(event: KeyboardEvent): void {
    if (!active.value || event.key !== 'Escape' || !(event.target instanceof Node) || !root.value?.contains(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    dismiss()
  }
  // Observing the whole workbench while idle is expensive. Each eligible receipt
  // owns one observer; dismissing or replacing it releases all layout listeners.
  watch([root, () => active.value || Boolean(eligible.value && !seen(eligible.value.jobId))], ([element, observing], _, cleanup) => {
    if (!element || !observing) return
    const observer = new MutationObserver(refresh)
    observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'class', 'style'] })
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    cleanup(() => {
      observer.disconnect()
      window.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
    })
  }, { immediate: true, flush: 'post' })
  onScopeDispose(() => {
    controller?.abort()
    hide()
  })
  return { active, target, name, page, total, running, error, next, dismiss, openSettings, run }
}
