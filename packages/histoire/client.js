import { logEvent } from '@histoire/app'
import { pushHistoireTestRegistration } from '@histoire/shared'

export * from '@histoire/app'

export function isCollecting() {
  return process.env.HST_COLLECT === 'true'
}

export function isTesting() {
  return globalThis.__HST_TEST__ === true
}

export function onTest(register) {
  pushHistoireTestRegistration(register)
}

/**
 * @deprecated
 */
export function hstEvent(...args) {
  console.warn(`'hstEvent' is deprecated. Use 'logEvent' instead.`)
  return logEvent(...args)
}
