import type { QualifiedContribution, ToolbarGroup } from '@histoire/plugin-kit'
import type { ShortcutRegistry } from '../util/shortcuts.js'
import type { WorkbenchHost } from './create-workbench-host.js'
import { createContributionKeys } from '@histoire/plugin-kit'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useExtensionHost } from '../composables/extensions.js'

/** Registered toolbar item. */
export type PluginToolbarItem = QualifiedContribution<'toolbar.item'>

/**
 * Documented canvas contribution groups, in toolbar order. Plugin items follow their group's
 * controls; `plugins` is the final contribution group and receives unknown groups. The built-in
 * inspector action occupies a separate final overflow item after all contribution groups.
 */
export const TOOLBAR_GROUPS = ['search', 'tools', 'arrange', 'viewport', 'zoom', 'background', 'screenshot', 'embed', 'inspector', 'ui', 'plugins'] as const satisfies readonly ToolbarGroup[]

/** Available plugin toolbar items per group, in registry order. */
export type PluginToolbarGroups = Record<ToolbarGroup, PluginToolbarItem[]>

/**
 * Groups available toolbar items of the root context by toolbar group.
 * @param workbench Workbench extension host.
 */
export function listPluginToolbarItems(workbench: WorkbenchHost): PluginToolbarGroups {
  const groups = Object.fromEntries(TOOLBAR_GROUPS.map(group => [group, []])) as unknown as PluginToolbarGroups
  for (const item of workbench.host.available('toolbar.item', workbench.context)) {
    const group = (TOOLBAR_GROUPS as readonly string[]).includes(item.group) ? item.group : 'plugins'
    groups[group].push(item)
  }
  return groups
}

/**
 * Shortcut hint of a plugin button: the first registered binding of the command it names
 * (`command`), formatted by the shortcut registry like built-in toolbar hints. Bindings skipped
 * for conflicts are not registered, so they never show. Reads `shortcuts.entries` (reactive).
 * @param workbench Workbench extension host.
 * @param shortcuts Shortcut registry of the same workbench.
 * @param item Toolbar item.
 */
export function pluginToolbarHint(workbench: WorkbenchHost, shortcuts: ShortcutRegistry | undefined, item: PluginToolbarItem): string | undefined {
  // Custom items render their own control, so only button-like items carry a hint.
  const command = item.type === 'custom' ? undefined : item.command
  if (!command || !shortcuts) return undefined
  const bound = workbench.host.contributions('shortcut').find(shortcut => shortcut.command === command && shortcuts.entries.has(shortcut.id))
  return bound ? shortcuts.hint(bound.id) || undefined : undefined
}

/**
 * Nearest workbench extension host, or `undefined` for toolbars mounted outside a workbench
 * (embedding hosts and isolated component tests have none).
 */
function optionalExtensionHost(): WorkbenchHost | undefined {
  try {
    return useExtensionHost()
  }
  catch {
    return undefined
  }
}

/**
 * Reactive plugin toolbar state for a toolbar component. Registry snapshots and availability
 * predicates are not reactive, so host notifications (commits, context changes, diagnostics)
 * bump `revision`, which items also read to refresh toggle state.
 */
export function usePluginToolbar() {
  const workbench = optionalExtensionHost()
  const revision = ref(0)
  if (workbench) onBeforeUnmount(workbench.host.subscribe(() => revision.value++))
  const groups = computed(() => {
    void revision.value
    return workbench ? listPluginToolbarItems(workbench) : undefined
  })
  // Keys follow contribution objects: an item re-registered under the same id remounts.
  const keyOf = createContributionKeys()
  return { workbench, revision, groups, keyOf }
}
