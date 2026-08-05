import type { HistoireTestRegistration } from '@histoire/shared'
import { TEST_REGISTRY_KEY } from '@histoire/shared'

const TEST_FLAG_KEY = '__HST_TEST__'

/**
 * Installs `registry` as the ambient test registry (and `testing` as the
 * ambient test flag) for the duration of `fn`, then restores the previous
 * values. Story setup code registers tests by pushing onto the global, so this
 * is the only channel through which a mount phase's registrations are captured.
 *
 * The globals are shared process-wide, which is why session work is serialized
 * (see `createExclusiveQueue`) instead of running concurrently.
 * @param registry Array collecting the registrations emitted by `fn`.
 * @param testing Value of the ambient `__HST_TEST__` flag during `fn`.
 * @param fn The work to run with the registry installed.
 */
export function withRegistry(
  registry: HistoireTestRegistration[],
  testing: boolean,
  fn: () => Promise<void> | void,
): Promise<void> {
  const previousRegistry = (globalThis as any)[TEST_REGISTRY_KEY]
  const previousFlag = (globalThis as any)[TEST_FLAG_KEY]
  ;(globalThis as any)[TEST_REGISTRY_KEY] = registry
  ;(globalThis as any)[TEST_FLAG_KEY] = testing
  return Promise.resolve().then(fn).finally(() => {
    ;(globalThis as any)[TEST_REGISTRY_KEY] = previousRegistry
    ;(globalThis as any)[TEST_FLAG_KEY] = previousFlag
  })
}

/** Signature of {@link withRegistry}, as consumed by the mount helpers. */
export type WithRegistry = typeof withRegistry
