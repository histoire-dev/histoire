/** Preference namespace contains full normalized source and explicit caller key. */
export function getHistoirePersistenceKey(url: string, key: string): string {
  return `histoire:sdk:v1:${encodeURIComponent(url)}:${encodeURIComponent(key)}`
}
