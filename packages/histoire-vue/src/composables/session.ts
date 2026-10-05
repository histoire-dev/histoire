import type { HistoireSession } from '@histoire/sdk'
import { useHistoireContext } from '../provider/context.js'

/** Read explicit caller session from nearest native provider. */
export function useHistoireSession(): HistoireSession {
  return useHistoireContext().session
}
