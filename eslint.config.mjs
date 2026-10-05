import antfu, { react } from '@antfu/eslint-config'
import pluginCypress from 'eslint-plugin-cypress/flat'

export default antfu({
  react: false,
  ignores: [
    '**/histoire-dist/',
    '**/generated/',
    '**/public/',
    '**/.svelte-kit/',
    '.impeccable/hook.cache.json',
    // Offline Carbon subset is generated from Iconify's package data.
    'packages/histoire-shared/src/icons/carbon-icons.json',
  ],
}, {
  rules: {
    'curly': ['error', 'multi-line', 'consistent'],
    'antfu/if-newline': 'off',
    'antfu/no-import-dist': 'off',
    'node/prefer-global/process': 'off',
    'no-console': 'warn',
    'ts/no-use-before-define': 'warn',
    'vue/define-macros-order': 'off', // Bugged
    'unused-imports/no-unused-vars': 'off', // Bugged on catch : https://github.com/sweepline/eslint-plugin-unused-imports/issues/105
  },
}, {
  files: ['**/*.vue'],
  rules: {
    'import/first': 'off',
  },
}, {
  files: ['**/*.cy.js'],
  plugins: {
    cypress: pluginCypress,
  },
}, pluginCypress.configs.globals, ...await react({
  files: ['packages/histoire-plugin-react/**/*.{ts,tsx}', 'examples/react/**/*.{ts,tsx,jsx}'],
  overrides: {
    // Framework adapters support React 18, which still requires Context.Provider.
    'react/no-context-provider': 'off',
  },
}))
