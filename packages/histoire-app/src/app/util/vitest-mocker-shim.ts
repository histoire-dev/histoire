type DynamicImportLoader<T = unknown> = () => Promise<T>

interface DynamicImportWrapperOwner {
  wrapDynamicImport?: <T>(loader: DynamicImportLoader<T>) => Promise<T>
}

function ensureDynamicImportWrapper<T extends DynamicImportWrapperOwner>(owner: T | undefined, create: () => T) {
  const resolvedOwner = owner ?? create()

  if (typeof resolvedOwner.wrapDynamicImport !== 'function') {
    resolvedOwner.wrapDynamicImport = loader => loader()
  }

  return resolvedOwner
}

ensureDynamicImportWrapper(globalThis.__vitest_mocker__, () => {
  const mocker = {}
  globalThis.__vitest_mocker__ = mocker
  return mocker
})

ensureDynamicImportWrapper(globalThis.__vitest_browser_runner__, () => {
  const runner = {}
  globalThis.__vitest_browser_runner__ = runner
  return runner
})
