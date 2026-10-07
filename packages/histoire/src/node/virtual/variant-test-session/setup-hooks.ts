/**
 * Whether project setup modules can add registrations during a vanilla mount.
 * Missing generated metadata is inconclusive, so it blocks the shortcut.
 * @param generatedSetup Generated global setup module namespace.
 * @param configuredSetup Configured browser setup module namespace.
 */
export function hasVanillaSetupHooks(
  generatedSetup: { hasSetupVanilla?: unknown } | undefined,
  configuredSetup: { setupVanilla?: unknown } | undefined,
) {
  return generatedSetup?.hasSetupVanilla !== false
    || typeof configuredSetup?.setupVanilla === 'function'
}

/** Emits the lazy, private setup-hook probe used by generated test runtimes. */
export function generatedKnownEmptySetupProbe() {
  return `async function canSkipKnownEmptyCollection() {
  try {
    const generatedSetup = await runWithVitestDynamicImport(() => import('virtual:$histoire-generated-global-setup'))
    const setup = await runWithVitestDynamicImport(() => import('virtual:$histoire-setup'))

    return !hasVanillaSetupHooks(generatedSetup, setup)
  }
  catch {
    // An inconclusive probe falls back to the existing mount path.
    return false
  }
}`
}
