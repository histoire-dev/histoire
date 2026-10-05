import type { MatrixStore } from '../../stores/matrix.js'
import { computed } from 'vue'

/** Keep ordinary admitted previews available until requested matrix can discover its axes. */
export function createCanvasArrangement(requested: () => 'grid' | 'list' | 'matrix', matrix: Pick<MatrixStore, 'available'>) {
  return computed(() => requested() === 'matrix' && !matrix.available.value ? 'grid' : requested())
}
