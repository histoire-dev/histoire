import type { installedPlugins } from 'virtual:$histoire-config'

/** Resolved inventory row, including disabled and local entries. */
export type InstalledPlugin = (typeof installedPlugins)[number]
