declare module 'virtual:$histoire-commands' {
  import type { ClientCommand } from '@histoire/shared'

  export const registeredCommands: ClientCommand[]
}

declare module 'virtual:$histoire-build-info' {
  import type { HistoireBuildInfo } from '@histoire/shared'

  export const buildInfo: HistoireBuildInfo
  /** Observes metadata replacements until the captured workbench detaches. */
  export function onBuildInfoUpdate(listener: (value: HistoireBuildInfo) => void): () => void
}

declare module 'virtual:*';
