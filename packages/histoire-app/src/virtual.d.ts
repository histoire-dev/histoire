declare module 'virtual:$histoire-commands' {
  import type { ClientCommand } from '@histoire/shared'

  export const registeredCommands: ClientCommand[]
}

declare module 'virtual:$histoire-config' {
  import type { HistoireConfig, PluginMetadata } from '@histoire/shared'

  export const config: HistoireConfig
  export const logos: HistoireConfig['theme']['logo']
  /** Public plugin details in resolved configuration order. */
  export const installedPlugins: Array<PluginMetadata & {
    /** Resolved plugin name. */ name: string
    /** Built-in implementation. */ builtin: boolean
    /** Workbench identity. */ id?: string
    /** Workbench entry available. */ client: boolean
    /** Frame entry available. */ frame: boolean
    /** Active in this configuration. */ enabled: boolean
    /** Generation-scoped toggle capability. */ toggleId?: string
    /** Installed npm identity. */ packageName?: string
    /** Installed version, or local for authored/workspace code. */ version?: string
    /** Authored or workspace dependency. */ local: boolean
    /** Framework support or builtin. */ required: boolean
    /** Bundled identity under the first-party scope. */ official: boolean
    /** Exact dependency declaration; updates remain visible. */ pinned?: boolean
  }>
}

declare module 'virtual:$histoire-workbench-plugins' {
  import type { HistoireJsonValue } from '@histoire/protocol'

  /** Lazy plugin workbench (`client`) entries, in config order; dev-only entries are absent from static builds. */
  export const workbenchPlugins: Array<{
    /** Plugin id from the Node descriptor. */
    id: string
    /** Extension contract version. */
    apiVersion: 1
    /** Validated browser-visible JSON options. */
    options: HistoireJsonValue | undefined
    /** Imports the entry module; its default export is the plugin definition. */
    load: () => Promise<{ default: unknown }>
  }>
}

declare module 'virtual:$histoire-frame-plugins' {
  import type { HistoireJsonValue } from '@histoire/protocol'

  /** Lazy plugin frame entries, in config order; dev-only entries are absent from static builds. */
  export const framePlugins: Array<{
    /** Plugin id from the Node descriptor. */
    id: string
    /** Extension contract version. */
    apiVersion: 1
    /** Validated browser-visible JSON options. */
    options: HistoireJsonValue | undefined
    /** Imports the entry module; its default export is the frame plugin definition. */
    load: () => Promise<{ default: unknown }>
  }>
}

declare module 'virtual:$histoire-build-info' {
  import type { HistoireBuildInfo } from '@histoire/shared'

  export const buildInfo: HistoireBuildInfo
  /** Observes metadata replacements until the captured workbench detaches. */
  export function onBuildInfoUpdate(listener: (value: HistoireBuildInfo) => void): () => void
}

declare module 'virtual:$histoire-marketplace-official' {
  import type { PluginDetail } from '@histoire/shared'

  /** Bundled official detail DTOs, generated from first-party package manifests. */
  export const officialPlugins: PluginDetail[]
}

declare module 'virtual:*';
