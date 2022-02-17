import type { HistoireConfig } from '../../../node/config'
// @ts-expect-error virtual module
import { config as configRaw, logos as logosRaw } from '$histoire-config'

export const histoireConfig: HistoireConfig = configRaw
export const customLogos: HistoireConfig['theme']['logo'] = logosRaw
