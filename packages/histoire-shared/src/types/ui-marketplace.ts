import type { CatalogPage, CatalogQuery, ChangePlan, ChangeRequest, JobState, MarketplacePrefs, PluginDetail, PluginId } from './marketplace.js'

/** Public marketplace request failure. */
export interface MarketplaceError {
  /** Recoverable failure category. */ code: 'unavailable' | 'invalid' | 'busy' | 'stale' | 'failed' | 'not-found'
  /** Short visible explanation. */ message: string
}
/** Correlated result with a feature-specific success payload. */
export type MarketplaceResult<T> = { /** Browser request identity. */ requestId: string } & (T | { /** Recoverable failure. */ error: MarketplaceError })
/** Compatible update offered by installed inventory. */
export interface MarketplaceUpdate {
  /** npm identity. */ id: PluginId
  /** Actual installed version. */ from: string
  /** Compatible target version. */ to: string
  /** Contains breaking release notes. */ breaking: boolean
}
/** Broadcast snapshots optionally correlate start/current replies; errors stay private. */
export type MarketplaceJobEvent =
  | { /** Request identity on direct replies. */ requestId?: string, /** Current job, absent when idle. */ job: JobState | null }
  | { /** Failed request identity. */ requestId: string, /** Private request rejection. */ error: MarketplaceError }
  | { /** Cancelled job identity. */ jobId: string, /** Cancellation rejection. */ error: MarketplaceError }

declare module './ui-channel.js' {
  interface UiClientEvents {
    /** Query catalog. */ 'histoire:ui:marketplace-catalog': { /** Correlation. */ requestId: string, /** Search and preferences. */ query: CatalogQuery }
    /** Read plugin details. */ 'histoire:ui:marketplace-detail': { /** Correlation. */ requestId: string, /** npm identity. */ id: PluginId, /** Preferences. */ prefs: MarketplacePrefs }
    /** Read compatible target notes and migrations. */ 'histoire:ui:marketplace-update-detail': { /** Correlation. */ requestId: string, /** npm identity. */ id: PluginId, /** Preferences. */ prefs: MarketplacePrefs }
    /** Prepare reviewable changes. */ 'histoire:ui:marketplace-plan': { /** Correlation. */ requestId: string, /** Intent. */ request: ChangeRequest }
    /** Admit an already reviewed plan. */ 'histoire:ui:marketplace-job-start': { /** Correlation. */ requestId: string, /** Plan identity. */ planId: string, /** Reviewed hash. */ hash: string }
    /** Cancel server-owned work. */ 'histoire:ui:marketplace-job-cancel': { /** Job identity. */ jobId: string }
    /** Resume a job paused before its config write (`afterInstall: 'ask'`). */ 'histoire:ui:marketplace-job-continue': { /** Job identity. */ jobId: string }
    /** Read active or latest job. */ 'histoire:ui:marketplace-job-current': { /** Correlation. */ requestId: string }
    /** Read compatible updates. */ 'histoire:ui:marketplace-updates': { /** Correlation. */ requestId: string, /** Preferences. */ prefs: MarketplacePrefs }
  }
  interface UiServerEvents {
    /** Catalog reply. */ 'histoire:ui:marketplace-catalog-result': MarketplaceResult<{ /** Page. */ page: CatalogPage }>
    /** Detail reply. */ 'histoire:ui:marketplace-detail-result': MarketplaceResult<{ /** Details. */ detail: PluginDetail }>
    /** Compatible target with intervening notes and selected migration operations. */ 'histoire:ui:marketplace-update-detail-result': MarketplaceResult<{ /** Update details. */ detail: PluginDetail }>
    /** Plan reply. */ 'histoire:ui:marketplace-plan-result': MarketplaceResult<{ /** Reviewed plan. */ plan: ChangePlan }>
    /** Job snapshot or private rejection. */ 'histoire:ui:marketplace-job-state': MarketplaceJobEvent
    /** Compatible updates reply. */ 'histoire:ui:marketplace-updates-result': MarketplaceResult<{ /** Updates. */ updates: MarketplaceUpdate[] }>
  }
}
