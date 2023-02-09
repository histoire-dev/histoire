import { markRaw } from 'vue'
import { searchData as _searchData, onUpdate as _onUpdate } from 'virtual:$histoire-search-title-data'
import type { SearchData } from './types.js'

export const searchData: SearchData = markRaw(_searchData)

export function onUpdate (cb: (data: SearchData) => unknown) {
  _onUpdate(cb)
}
