import { markRaw } from 'vue'
// @ts-expect-error virtual module
import { searchData as _searchData, onUpdate as _onUpdate } from '$histoire-search-data'

export const searchData: Record<string, any> = markRaw(_searchData)

export function onUpdate (cb: (data: typeof searchData) => unknown) {
  _onUpdate(cb)
}
