import type { HistoireConfig } from '@histoire/shared'
// @ts-expect-error virtual module
import { config as configRaw, logos as logosRaw } from '$histoire-config'

export const histoireConfig: HistoireConfig = configRaw
export const customLogos: HistoireConfig['theme']['logo'] = logosRaw
