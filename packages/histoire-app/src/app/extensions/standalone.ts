import type { TestsService } from '@histoire/plugin-kit'
import type { WorkbenchProps } from '../standalone/workbench-types.js'
import type { WorkbenchHost } from './create-workbench-host.js'
import type { WorkbenchNavigationTargets } from './navigation.js'
import { provideHistoireExtensions, useHistoireResource } from '@histoire/vue/internal'
import { watch } from 'vue'
import { inspectionPluginEntries } from '../components/inspector/inspection/plugin.js'
import { injectWorkbenchPlugins, provideExtensionHost } from '../composables/extensions.js'
import { histoireConfig } from '../util/config.js'
import { createWorkbenchHost } from './create-workbench-host.js'
import { resolveDevEventService } from './dev-events.js'
import { createContributionLookup } from './shell-registry.js'
import { createWorkbenchStorage, getWorkbenchStorageNamespace } from './storage.js'

/**
 * Creates and provides the extension host of the standalone workbench. Plugin setup runs in
 * the background; the host is disposed with the workbench provider.
 * @param props Standalone workbench ownership.
 * @param targets Existing workbench navigation, except story selection which uses the session.
 * @param tests Project test runs exposed to plugins; dev server only.
 */
export function useStandaloneExtensionHost(props: WorkbenchProps, targets: Omit<WorkbenchNavigationTargets, 'selectStory'>, tests?: TestsService): WorkbenchHost {
  const mode = props.session.getSnapshot().source?.mode ?? (__HISTOIRE_DEV__ ? 'dev' : 'static')
  const workbench = createWorkbenchHost({
    session: props.session,
    mode,
    plugins: inspectionPluginEntries(injectWorkbenchPlugins(), histoireConfig.inspection?.enabled === true, props.session, props.runtime.current, message => console.warn(message), () => workbench?.selectedFrame.current() ?? null),
    navigation: { ...targets, selectStory: input => props.session.selection.select(input) },
    devEvents: __HISTOIRE_DEV__ ? resolveDevEventService({ mode, hot: Boolean(import.meta.hot), window: props.hostWindow }) : undefined,
    tests,
    storage: createWorkbenchStorage(props.hostWindow),
    storageNamespace: getWorkbenchStorageNamespace(props.previewBase),
  })
  provideExtensionHost(workbench)
  // Nested native providers (the selected-frame inspector) reuse this host; they never own it.
  provideHistoireExtensions(workbench.host)
  // The settings route guard resolves plugin sections in this workbench's registry.
  const unbindSettings = props.navigation.bindSettingsSections(createContributionLookup(workbench, 'settings.section'))
  // The runtime binding holds the selected admitted frame session, or the canonical session
  // when no frame is admitted; only a frame session scopes the inspector.
  const stop = watch(props.runtime.current, (current) => {
    workbench.selectedFrame.publish(current === props.session ? undefined : current)
  }, { immediate: true, flush: 'sync' })
  useHistoireResource(() => {
    stop()
    unbindSettings()
    return workbench.dispose()
  })
  return workbench
}
