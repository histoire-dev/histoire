import type { PluginDetail } from '@histoire/shared'
import type { Ref } from 'vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, onScopeDispose, ref } from 'vue'
import { useOptionalExtensionHost } from '../../../composables/extensions.js'

/** Actual browser registration with optional manifest description and command. */
export interface SpotlightTarget {
  /** Qualified contribution identity. */ id: string
  /** Marketplace contribution kind. */ kind: 'inspector-tab' | 'rail-pane' | 'toolbar-tool'
  /** Browser registration's visible label. */ label: string
  /** Human-readable addition. */ title: string
  /** Declarative explanation, never used as registration evidence. */ description?: string
  /** Explicit primary command, when available for this plugin. */ command?: { /** Qualified command identity. */ id: string, /** Visible action label. */ label: string }
}
/** Target and its currently visible DOM control. */
export interface AnchoredSpotlightTarget extends SpotlightTarget {
  /** Existing control in the owning document. */ anchor: HTMLElement
}

/** Ignore hidden, inert, offscreen and unlaid-out controls, including overflow duplicates. */
function visible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
}

/** Map only live registrations of the installed descriptor to existing surface anchors. */
export function useSpotlightTargets(pluginId: Ref<string | undefined>, detail: Ref<PluginDetail | undefined>) {
  const workbench = useOptionalExtensionHost()
  const provider = useHistoireContext()
  const revision = ref(0)
  const ready = ref(!workbench)
  let disposed = false
  /** Registry and selected context changes invalidate the live contribution list. */
  function refresh(): void {
    revision.value++
  }
  const stops = workbench ? [workbench.host.subscribe(refresh), workbench.context.subscribe(refresh), workbench.selectedFrame.subscribe(refresh)] : []
  void workbench?.host.ready.then(() => {
    if (!disposed) ready.value = true
  })
  onScopeDispose(() => {
    disposed = true
    for (const stop of stops) stop()
  })
  const targets = computed<SpotlightTarget[]>(() => {
    void revision.value
    if (!ready.value || !workbench || !pluginId.value) return []
    const { host, context } = workbench
    const frame = workbench.selectedFrame.current()?.context
    const tabs = frame ? host.available('inspector.tab', frame) : host.contributions('inspector.tab').filter(item => !item.devOnly || context.source.mode === 'dev')
    const commands = host.available('command', context)
    const registrations = [
      ...tabs.map(item => ({ item, kind: 'inspector-tab' as const, noun: 'tab' })),
      ...host.available('shell.pane', context).map(item => ({ item, kind: 'rail-pane' as const, noun: 'pane' })),
      ...host.available('toolbar.item', context).map(item => ({ item, kind: 'toolbar-tool' as const, noun: 'tool' })),
    ].filter(({ item }) => item.pluginId === pluginId.value)
    return registrations.map(({ item, kind, noun }) => {
      // Only an explicit command relation is actionable; never guess from a similar label.
      const commandId = item.kind === 'toolbar.item'
        ? item.type !== 'custom' ? item.command : undefined
        : item.primaryCommand
      const command = commands.find(candidate => candidate.pluginId === pluginId.value && candidate.id === commandId)
      const adds = detail.value?.manifest.adds?.filter(add => add.kind === kind)
      // Legacy first-of-kind descriptions are safe only for a single actual registration.
      const description = adds?.find(add => add.contribution === item.localId)?.text
        ?? (host.contributions(item.kind).filter(candidate => candidate.pluginId === pluginId.value).length === 1 ? adds?.[0]?.text : undefined)
      return { id: item.id, kind, label: item.label, title: `${item.label} ${noun} added`, description, ...(command ? { command: { id: command.id, label: command.label } } : {}) }
    })
  })
  /** Resolve IDs by exact attribute values without interpolating plugin data into CSS. */
  function anchorFor(target: SpotlightTarget): HTMLElement | undefined {
    return [...provider.root.value?.querySelectorAll<HTMLElement>('[data-histoire-contribution]') ?? []]
      .find(element => element.getAttribute('data-histoire-contribution') === target.id && visible(element))
  }
  return { workbench, root: provider.root, ready, targets, anchorFor }
}
