import type { HistoireConfig } from '../../../node/config'
// @ts-expect-error virtual module
import configRaw from '$histoire-config'

export const histoireConfig: HistoireConfig = configRaw
