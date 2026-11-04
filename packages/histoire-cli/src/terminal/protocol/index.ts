import type { CatalogEvents, CatalogOperations } from './catalog.js'
import type { CoreEvents, CoreOperations } from './core.js'
import type { DiagnosticsOperations } from './diagnostics.js'
import type { ProgressEvents } from './progress.js'
import type { SessionOperations } from './session.js'
import type { TestEvents, TestOperations } from './tests.js'
import type { WatchEvents, WatchOperations } from './watch.js'

export type {
  CatalogEvents,
  CatalogListArgs,
  CatalogListPage,
  CatalogOperations,
  CatalogStateDto,
  CatalogStoryDto,
  CatalogVariantDto,
  CatalogVariantsArgs,
  CatalogVariantsPage,
  CatalogWorkbenchDto,
} from './catalog.js'

/** Flattens an intersection into one anonymous object type, which (unlike the intersection) satisfies `TerminalOperationMap`'s index signature. */
type Flatten<T> = { [K in keyof T]: T[K] }

/** Every operation the parent may send; domain slices intersect their map here. */
export type TerminalOperations = Flatten<CoreOperations & CatalogOperations & SessionOperations & DiagnosticsOperations & TestOperations & WatchOperations>

/** Every event the child may emit; domain slices intersect their map here. */
export type TerminalEvents = CoreEvents & CatalogEvents & ProgressEvents & TestEvents & WatchEvents

export type {
  CoreEvents,
  CoreOperations,
  TerminalErrorCode,
  TerminalEventMap,
  TerminalLogEvent,
  TerminalLogLevel,
  TerminalOperationDefinition,
  TerminalOperationMap,
} from './core.js'

export type { DiagnosticIssueDto, DiagnosticsCollectionDto, DiagnosticsDto, DiagnosticsMcpDto, DiagnosticsOperations } from './diagnostics.js'

export type {
  ProgressEvent,
  ProgressEvents,
  ProgressStatus,
  RestartCause,
  RestartCauseKind,
  RestartRequest,
  StartupPhaseId,
} from './progress.js'

export type { SessionCollectionDto, SessionInfoDto, SessionMcpDto, SessionOperations } from './session.js'

export type {
  TestCaseDto,
  TestEvents,
  TestOperationDto,
  TestOperations,
  TestOperationState,
  TestProgressDto,
  TestResultsPage,
  TestSummaryDto,
  TestTarget,
  TestTargetDto,
} from './tests.js'

export type { WatchEvents, WatchOperations, WatchPhase, WatchSetArgs, WatchStateDto } from './watch.js'
