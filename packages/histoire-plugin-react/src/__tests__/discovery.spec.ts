// @vitest-environment node

import type { PluginOption, UserConfig } from 'vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { createLogger, resolveConfig } from 'vite'
import { expect, it, vi } from 'vitest'
import { HstVue } from '../../../histoire-plugin-vue/src/index.node.js'
import { getDefaultConfig } from '../../../histoire/src/node/config/defaults.js'
import { mergeConfig } from '../../../histoire/src/node/config/merge.js'
import { HstReact } from '../index.node.js'

it('retains Vue and Svelte story discovery while adding React defaults', async () => {
  let config = getDefaultConfig()
  for (const plugin of [HstVue(), HstReact()]) {
    config = mergeConfig(await plugin.defaultConfig?.(config, 'dev'), config)
  }

  expect(config.storyMatch).toEqual([
    '**/*.story.vue',
    '**/*.story.svelte',
    '**/*.story.tsx',
    '**/*.story.jsx',
  ])
  expect(config.supportMatch).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'vue', pluginIds: ['vue3'] }),
    expect.objectContaining({ id: 'react', pluginIds: ['react'] }),
  ]))
})

it('preserves existing custom patterns without duplicating React defaults', async () => {
  const config = {
    ...getDefaultConfig(),
    storyMatch: ['ui/**/*.story.tsx', '**/*.story.jsx'],
  }
  const defaults = await HstReact().defaultConfig?.(config, 'dev')

  expect(mergeConfig(defaults, config).storyMatch).toEqual([
    'ui/**/*.story.tsx',
    '**/*.story.jsx',
    '**/*.story.tsx',
  ])
})

it('allows explicit user patterns to override extended plugin defaults', async () => {
  const config = getDefaultConfig()
  const defaults = mergeConfig(await HstReact().defaultConfig?.(config, 'dev'), config)
  const userConfig = { storyMatch: ['selected/**/*.story.tsx'] }

  expect(mergeConfig(userConfig, defaults).storyMatch).toEqual(userConfig.storyMatch)
})

it('warns when the consuming project has no JSX plugin', async () => {
  const warnings = await resolveJsxWarnings([])

  expect(warnings).toHaveBeenCalledWith('[Histoire React] Add @vitejs/plugin-react to your Vite config to transform JSX stories.')
})

it('warns when a mixed project only configures Vue JSX transformation', async () => {
  const warnings = await resolveJsxWarnings([
    vueJsx({ include: /vue-components\/.*\.[jt]sx$/ }),
  ])

  expect(warnings).toHaveBeenCalledWith('[Histoire React] Add @vitejs/plugin-react to your Vite config to transform JSX stories.')
})

it.each(['vite:react-babel', 'vite:react-swc', 'vite:react-oxc'])('recognizes the consumer JSX plugin %s', async (pluginName) => {
  const warnings = await resolveJsxWarnings([{ name: pluginName }])

  expect(warnings).not.toHaveBeenCalledWith('[Histoire React] Add @vitejs/plugin-react to your Vite config to transform JSX stories.')
})

/** Run actual Vite resolution so the checker sees itself and consumer plugins. */
async function resolveJsxWarnings(plugins: PluginOption[]) {
  const defaults = await HstReact().defaultConfig!(getDefaultConfig(), 'dev')
  const config = defaults!.vite as UserConfig
  const logger = createLogger('silent')
  const warnings = vi.spyOn(logger, 'warn')
  await resolveConfig({
    ...config,
    configFile: false,
    customLogger: logger,
    plugins: [...config.plugins ?? [], ...plugins],
  }, 'serve')
  return warnings
}
