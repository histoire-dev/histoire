import type { HistoireStoryFrame } from '../types/catalog.js'

/** Width and height must be positive CSS pixels. Padding can also be zero. */
export function isHistoireStoryFrameValue(key: keyof HistoireStoryFrame, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && (key === 'padding' ? value >= 0 : value > 0)
}
