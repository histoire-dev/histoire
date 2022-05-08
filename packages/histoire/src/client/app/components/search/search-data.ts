import { markRaw } from 'vue'
// @ts-expect-error virtual module
import { searchData as _searchData, onUpdate as _onUpdate } from '$histoire-search-data'

export interface SearchData {
  index: Record<string, any>
  idMap: Record<number, { id: string, kind: string }>
}

export const searchData: SearchData = markRaw(_searchData)

export function onUpdate (cb: (data: SearchData) => unknown) {
  _onUpdate(cb)
}
