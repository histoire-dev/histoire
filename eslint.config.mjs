import antfu from '@antfu/eslint-config'

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
  },
}, {
  files: ['**/*.vue'],
  rules: {
    'import/first': 'off',
  },
})
