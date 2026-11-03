import type { HistoireJsonValue } from '@histoire/protocol'
import type { Plugin } from '@histoire/shared'
import type { A11yOptions } from './options.js'
import { fileURLToPath } from 'node:url'
import { normalizeOptions } from './options.js'

export type { A11yImpact, A11yOptions, A11yScanOptions, A11yTestOptions } from './options.js'

/** Install axe-core audits in inspector and optional fresh-mount story tests. */
export function HstA11y(options: A11yOptions = {}): Plugin {
  const browser = normalizeOptions(options)
  return {
    name: '@histoire/plugin-a11y',
    metadata: { displayName: 'Accessibility', description: 'Accessibility audits with axe-core', icon: 'list-checked', docsUrl: 'https://histoire.dev/guide/plugins/a11y.html', repoUrl: 'https://github.com/histoire-dev/histoire/tree/main/packages/histoire-plugin-a11y' },
    workbench: options.enabled === false
      ? undefined
      : {
          id: 'a11y',
          apiVersion: 1,
          client: fileURLToPath(new URL('./client.js', import.meta.url)),
          frame: fileURLToPath(new URL('./frame.js', import.meta.url)),
          // `tests`/`report` tell the workbench which project-wide source exists.
          options: { ...browser, tests: !!options.test, report: !!options.build } as unknown as HistoireJsonValue,
          devOnly: options.devOnly ?? false,
        },
    async onBuild(api) {
      // Static books without the UI have no pane to read the report.
      if (!options.build || options.enabled === false || options.devOnly) return
      const { createBuildScanner } = await import('./build/scan.js')
      const scanner = createBuildScanner(browser)
      api.onPreviewStory(scanner.scan)
      api.onBuildEnd(() => scanner.write(api.outputDir))
    },
    config(config, mode) {
      if (mode === 'build' || options.enabled === false || !options.test) return
      const names = new Set(['setupVanilla', ...config.plugins.flatMap(plugin => plugin.supportPlugin?.setupFn ?? [])])
      const settings = { ...browser, ...(typeof options.test === 'object' ? options.test : {}) }
      const code = `import { registerA11yTests } from '@histoire/plugin-a11y/test'\n${[...names].map(name => `export function ${name}() { registerA11yTests(${JSON.stringify(settings)}) }`).join('\n')}`
      config.setupCode = [...config.setupCode ?? [], code]
    },
  }
}
