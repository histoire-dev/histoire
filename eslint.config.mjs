import antfu from '@antfu/eslint-config'
import pluginCypress from 'eslint-plugin-cypress/flat'

export default antfu({
  ignores: [
    '**/histoire-dist/',
    '**/generated/',
    '**/public/',
    '**/.svelte-kit/',
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
}, pluginCypress.configs.globals)
