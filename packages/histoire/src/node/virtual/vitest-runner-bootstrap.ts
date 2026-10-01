/**
 * Generated-code helper wrapping every dynamic story import.
 *
 * Story modules transformed by Vitest's mocker go through
 * `__vitest_browser_runner__.wrapDynamicImport()` so their mocks apply; outside
 * a real Vitest browser run (or before its runner booted) the stub installed
 * here just calls the loader. Emitted by every generated module that imports a
 * story, so they all agree on the same wrapper.
 */
export const VITEST_DYNAMIC_IMPORT_SNIPPET = `function ensureVitestRunner() {
  const runner = globalThis.__vitest_browser_runner__ ?? {}
  if (typeof runner.wrapDynamicImport !== 'function') {
    runner.wrapDynamicImport = loader => loader()
  }
  globalThis.__vitest_browser_runner__ = runner
  return runner
}

function runWithVitestDynamicImport(loader) {
  return ensureVitestRunner().wrapDynamicImport(loader)
}`

/**
 * Renders the inline script that guarantees a usable
 * `__vitest_browser_runner__` before the app entry runs.
 *
 * Story modules transformed by Vitest's mocker call
 * `__vitest_browser_runner__.wrapDynamicImport()`, which does not exist outside
 * a real Vitest browser run. Both HTML documents Histoire serves (the dev
 * server's and the built one) need the same stub — emitting it from one place
 * keeps a divergence from silently breaking one of the two runtimes.
 * @param indent Leading whitespace of every emitted line, so the surrounding
 * HTML document keeps its own indentation.
 */
export function renderVitestRunnerBootstrap(indent = '') {
  return [
    `${indent}<script>`,
    `${indent}(() => {`,
    `${indent}  const runner = globalThis.__vitest_browser_runner__ ?? {}`,
    `${indent}  if (typeof runner.wrapDynamicImport !== 'function') {`,
    `${indent}    runner.wrapDynamicImport = loader => loader()`,
    `${indent}  }`,
    `${indent}  globalThis.__vitest_browser_runner__ = runner`,
    `${indent}})()`,
    `${indent}</script>`,
  ].join('\n')
}
