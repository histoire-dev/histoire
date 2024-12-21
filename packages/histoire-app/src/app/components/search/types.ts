export interface SearchData {
  index: Array<{ id: number, text: string }>
  idMap: Record<number, { id: string, kind: string }>
}
