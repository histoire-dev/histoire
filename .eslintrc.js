module.exports = {
  root: true,
  env: {
    browser: true,
  },
  extends: [
    'plugin:vue/vue3-recommended',
    '@vue/standard',
    '@vue/typescript/recommended',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 2020,
  },
  globals: {
    name: 'off',
    defineExpose: false,
  },
  rules: {
    'vue/html-closing-bracket-newline': [
      'error',
      {
        singleline: 'never',
        multiline: 'always',
      },
    ],
    'no-var': ['error'],
    '@typescript-eslint/member-delimiter-style': [
      'error',
      {
        multiline: {
          delimiter: 'none',
        },
        singleline: {
          delimiter: 'comma',
        },
      },
    ],
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-use-before-define': 'off',
    'comma-dangle': ['error', 'always-multiline'],
    'vue/no-multiple-template-root': 'off',
    indent: 'off',
    '@typescript-eslint/indent': ['error', 2],
    'no-use-before-define': 'off',
    quotes: ['error', 'single', { allowTemplateLiterals: true }],
    'vue/multi-word-component-names': 'warn',
    '@typescript-eslint/type-annotation-spacing': ['error'],
    'func-call-spacing': 'off',
    '@typescript-eslint/func-call-spacing': ['error'],
    '@typescript-eslint/no-empty-interface': 'off',
  },
  overrides: [
    {
      files: ['*.vue'],
      rules: {
        'import/first': 'off',
      },
      globals: {
        defineProps: false,
        defineEmits: false,
      },
    },
    {
      files: ['**/cypress/**'],
      extends: [
        'plugin:cypress/recommended',
      ],
    },
    {
      files: ['packages/histoire-vendors/*.d.ts'],
      rules: {
        'import/export': 'off',
      },
    },
    {
      files: ['packages/histoire-vendors/src/**/*.ts'],
      rules: {
        'import/no-named-default': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'histoire-dist/',
    'generated/',
    '!.*',
    '.nuxt/',
    'examples/sveltekit',
  ],
}
