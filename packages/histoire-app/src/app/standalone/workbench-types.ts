import type { HistoireSession } from '@histoire/sdk/internal'
import type { HistoireTestsModel } from '@histoire/vue/internal'
import type { CanvasFrames } from '../composables/canvas-settings.js'
import type { CanvasStore } from '../stores/canvas.js'
import type { createStandaloneCommands } from './commands.js'
import type { createStandaloneFolders } from './folders.js'
import type { createStandaloneNavigation } from './navigation.js'

/** Public exposed canvas surface used by standalone frame actions. */
export interface WorkbenchCanvas {
  /** Per-canvas state tracks current selected frame and pan/zoom ownership. */
  canvas: CanvasStore
  /** Mounted preview records retain exact frame-specific SDK sessions. */
  registry: CanvasFrames
}

/** Explicit standalone ownership passed into the native workbench. */
export interface WorkbenchProps {
  /** Canonical session, already connected by bootstrap. */
  session: HistoireSession
  /** Standalone URL adapter. */
  navigation: ReturnType<typeof createStandaloneNavigation>
  /** Existing folder persistence adapter. */
  folders: ReturnType<typeof createStandaloneFolders>
  /** Existing plugin commands and docs activation adapter. */
  commands: ReturnType<typeof createStandaloneCommands>
  /** Selected variant's existing tests controller. */
  tests: HistoireTestsModel
  /** Exact source base, independent of history route. */
  previewBase: string
  /** Owning document's window. */
  hostWindow: Window
}
