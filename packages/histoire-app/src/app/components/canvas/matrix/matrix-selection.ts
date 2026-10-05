import type { CanvasStore } from '../../../stores/canvas.js'
import type { MatrixStore } from '../../../stores/matrix.js'
import { watch } from 'vue'

/** Bind local cell selection to tools without changing canonical SDK selection. */
export function watchMatrixFrameSelection(matrix: Pick<MatrixStore, 'selectedCell'>, canvas: Pick<CanvasStore, 'selectedFrame'>): () => void {
  let ownedKey: string | null = null
  const stop = watch(() => matrix.selectedCell.value?.key, (key) => {
    ownedKey = key ?? null
    canvas.selectedFrame = ownedKey
  }, { immediate: true, flush: 'sync' })

  return () => {
    stop()
    // Matrix disposal must not erase a normal frame already selected by its successor.
    if (canvas.selectedFrame === ownedKey) canvas.selectedFrame = null
  }
}
