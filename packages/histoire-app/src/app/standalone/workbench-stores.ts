import type { HistoireReadonly, HistoireSnapshot } from '@histoire/protocol'
import type { Ref } from 'vue'
import type { WorkbenchProps } from './workbench-types.js'
import { getHistoireSessionDescriptor } from '@histoire/sdk/internal'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { watch } from 'vue'
import { provideShell } from '../composables/shell.js'
import { createMatrixStore, provideMatrix } from '../stores/matrix.js'
import { createPresetConfigStore, providePresetConfigStore } from '../stores/presets-config.js'
import { createUiSettingsStore, provideUiSettingsStore } from '../stores/settings.js'
import { createShell } from '../stores/shell.js'
import { createStoryCanvasViews, provideStoryCanvasViews } from '../stores/story-canvas-views.js'
import { histoireConfig } from '../util/config.js'

/** Bind caller-owned local stores and matrix discovery to one workbench provider. */
export function useWorkbenchStores(hostWindow: WorkbenchProps['hostWindow'], snapshot: Readonly<Ref<HistoireReadonly<HistoireSnapshot>>>, route: Readonly<Ref<{ query: { rows?: unknown, cols?: unknown } }>>) {
  const context = useHistoireContext()
  let storage: Storage | undefined
  try {
    storage = hostWindow.localStorage
  }
  catch { /* Memory-only workbench remains usable when storage is blocked. */ }
  const shell = createShell({ dev: __HISTOIRE_DEV__, storage })
  provideShell(shell)
  useHistoireResource(shell.close)
  const settings = createUiSettingsStore({ storage, warn: console.warn })
  provideUiSettingsStore(settings)
  const storyCanvasViews = createStoryCanvasViews()
  provideStoryCanvasViews(storyCanvasViews)
  const presets = createPresetConfigStore({ storage, config: () => histoireConfig, warn: console.warn })
  providePresetConfigStore(presets)
  const matrix = createMatrixStore({
    storage,
    /** Descriptor owns source config; snapshot retains only book identity. */
    numericValues() {
      try {
        return getHistoireSessionDescriptor(context.session).config?.matrix?.numericValues
      }
      catch { /* Disconnected workbenches use built-in samples. */ }
    },
  })
  provideMatrix(matrix)
  useHistoireResource(matrix.close)
  watch(() => [snapshot.value.status, snapshot.value.stale, snapshot.value.runtime, snapshot.value.selection, snapshot.value.source, snapshot.value.catalog.stories, snapshot.value.state, route.value.query.rows, route.value.query.cols], () => matrix.synchronize(snapshot.value, {
    rows: typeof route.value.query.rows === 'string' ? route.value.query.rows : undefined,
    cols: typeof route.value.query.cols === 'string' ? route.value.query.cols : undefined,
  }), { immediate: true })
  return { shell, settings, storyCanvasViews, presets, matrix }
}
