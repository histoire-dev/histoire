/** Resolve npm identity through generation-owned installed metadata. */
export async function workbenchPluginId(packageName: string): Promise<string | undefined> {
  const { installedPlugins } = await import('virtual:$histoire-config')
  return installedPlugins.find(plugin => plugin.packageName === packageName)?.id
}
