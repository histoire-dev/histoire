import type { HistoireConfig } from '@histoire/shared'
import { tailwindTokens } from '../builtin-plugins/tailwind-tokens.js'
import { vanillaSupport } from '../builtin-plugins/vanilla-support/plugin.js'
import { defaultColors } from '../colors.js'
import { DEFAULT_COLLECT_TIMEOUT, DEFAULT_RUN_TIMEOUT, DEFAULT_STORY_COLLECT_TIMEOUT } from '../util/test-timeouts.js'

/**
 * Builds a fresh default Histoire configuration.
 *
 * A new object every call: the returned config is mutated in place by the
 * plugin `defaultConfig` hooks and by `processConfig`.
 */
export function getDefaultConfig(): HistoireConfig {
  return {
    plugins: [
      vanillaSupport(),
      tailwindTokens(),
    ],
    outDir: '.histoire/dist',
    storyMatch: [
      '**/*.story.vue',
      '**/*.story.svelte',
    ],
    storyIgnored: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    supportMatch: [],
    tree: {
      file: 'title',
      order: 'asc',
    },
    theme: {
      title: 'Histoire',
      colors: {
        primary: defaultColors.emerald,
        gray: defaultColors.zinc,
      },
      defaultColorScheme: 'auto',
      storeColorScheme: true,
      darkClass: 'dark',
    },
    responsivePresets: [
      {
        label: 'Mobile (Small)',
        width: 320,
        height: 560,
      },
      {
        label: 'Mobile (Medium)',
        width: 360,
        height: 640,
      },
      {
        label: 'Mobile (Large)',
        width: 414,
        height: 896,
      },
      {
        label: 'Tablet',
        width: 768,
        height: 1024,
      },
      {
        label: 'Laptop (Small)',
        width: 1024,
        height: null,
      },
      {
        label: 'Laptop (Large)',
        width: 1366,
        height: null,
      },
      {
        label: 'Desktop',
        width: 1920,
        height: null,
      },
      {
        label: '4K',
        width: 3840,
        height: null,
      },
    ],
    backgroundPresets: [
      {
        label: 'Transparent',
        color: 'transparent',
        contrastColor: '#333',
      },
      {
        label: 'White',
        color: '#fff',
        contrastColor: '#333',
      },
      {
        label: 'Light gray',
        color: '#aaa',
        contrastColor: '#000',
      },
      {
        label: 'Dark gray',
        color: '#333',
        contrastColor: '#fff',
      },
      {
        label: 'Black',
        color: '#000',
        contrastColor: '#eee',
      },
    ],
    sandboxDarkClass: 'dark',
    routerMode: 'history',
    build: {
      excludeFromVendorsChunk: [],
    },
    test: {
      buildCollection: 'hybrid',
      collectTimeout: DEFAULT_COLLECT_TIMEOUT,
      storyCollectTimeout: DEFAULT_STORY_COLLECT_TIMEOUT,
      runTimeout: DEFAULT_RUN_TIMEOUT,
    },
    vite: (config) => {
      // Remove vite:legacy plugins https://github.com/histoire-dev/histoire/issues/156
      const index = config.plugins?.findIndex(plugin => Array.isArray(plugin)
        && typeof plugin[0] === 'object'
        && !Array.isArray(plugin[0])
        // @ts-expect-error could have no property 'name'
        && plugin[0].name?.startsWith('vite:legacy'))
      if (index !== -1) {
        config.plugins?.splice(index, 1)
      }

      return {
        build: {
          lib: false,
        },
      }
    },
    viteIgnorePlugins: [],
  }
}
