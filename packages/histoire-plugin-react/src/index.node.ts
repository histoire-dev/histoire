import type { Plugin } from 'histoire'
import { defaultColors } from 'histoire'
import { usesLegacyVite } from './util/vite.js'

/** Stable name for the project's React configuration diagnostic. */
const JSX_CHECK_PLUGIN_NAME = 'histoire:check-react-jsx'

/** Official React transformer names; JSX alone also describes Vue-only plugins. */
const REACT_JSX_PLUGIN_NAMES = new Set(['vite:react-babel', 'vite:react-swc', 'vite:react-oxc'])

/** Register React story discovery and framework adapters. JSX plugin remains project-owned. */
export function HstReact(): Plugin {
  return {
    name: '@histoire/plugin-react',
    /** Story patterns replace arrays during config merging, so extend incoming defaults explicitly. */
    defaultConfig: config => ({
      storyMatch: [...new Set([...config.storyMatch, '**/*.story.tsx', '**/*.story.jsx'])],
      supportMatch: [{ id: 'react', patterns: ['**/*.story.tsx', '**/*.story.jsx'], pluginIds: ['react'] }],
      viteNodeTransformMode: { web: [/\.[jt]sx$/] },
      vite: {
        // A project JSX plugin can configure OXC through Vite 8 while Histoire's
        // workspace runtime uses Vite 7; retain automatic JSX in that collector.
        esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
        resolve: { dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
        plugins: [{
          name: JSX_CHECK_PLUGIN_NAME,
          /** Vitest's separate browser server also needs the CommonJS client entry. */
          config: () => ({ optimizeDeps: { include: ['react-dom/client'] } }),
          /** Inspect final plugins, including those loaded from project vite.config. */
          configResolved(config) {
            if (usesLegacyVite()) {
              // JSX plugins resolved alongside Vite 8 can return native Rolldown
              // hooks to a Vite 7 host. Retain their JS refresh fallback instead.
              for (const plugin of config.plugins) {
                if (plugin.name === 'vite:react:refresh-wrapper') {
                  plugin.applyToEnvironment = environment => environment.config.consumer === 'client'
                }
              }
            }
            if (!config.plugins.some(plugin => REACT_JSX_PLUGIN_NAMES.has(plugin.name))) {
              config.logger.warn('[Histoire React] Add @vitejs/plugin-react to your Vite config to transform JSX stories.')
            }
          },
        }],
      },
      theme: {
        colors: { primary: defaultColors.sky },
        logo: {
          square: '@histoire/plugin-react/assets/histoire-react.svg',
          light: '@histoire/plugin-react/assets/histoire-react-text.svg',
          dark: '@histoire/plugin-react/assets/histoire-react-text.svg',
        },
      },
    }),
    supportPlugin: {
      id: 'react',
      moduleName: '@histoire/plugin-react',
      setupFn: 'setupReact',
      importStoryComponent: (file, index) => `import Comp${index} from ${JSON.stringify(file.moduleId)}`,
    },
  }
}

export * from './index.js'
