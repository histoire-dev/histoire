const path = require('pathe')
const inheritedConfig = require('../../tailwind.config.cjs')

module.exports = {
  ...inheritedConfig,
  prefix: 'htw',
  content: [
    path.resolve(__dirname, './src/**/*.{vue,js,ts,jsx,tsx,md}'),
    // Include controls CSS directly
    path.resolve(__dirname, '../histoire-controls/src/**/*.{vue,js,ts,jsx,tsx,md}'),
  ],
}

module.exports.plugins.push(require('@tailwindcss/typography'))

module.exports.theme.extend.typography = theme => ({
  DEFAULT: {
    css: {
      'a': {
        'color': theme('colors.primary-500'),
        'textDecoration': 'none',

        '&:hover': {
          textDecoration: 'underline !important',
        },
      },

      'h1, h2, h3, h4, th': {
        'marginBottom': '0.75rem',

        '&:not(:first-child)': {
          marginTop: '1.25rem',
        },
      },

      '--tw-prose-invert-quote-borders': theme('colors.gray-800'),
      '--tw-prose-invert-hr': theme('colors.gray-800'),

      'blockquote': {
        'marginLeft': 0,
        'marginRight': 0,
        'backgroundColor': theme('colors.gray-100'),
        'padding': '.25rem .375rem',

        '& p:first-child': {
          marginTop: 0,
        },

        '& p:last-child': {
          marginBottom: 0,
        },

        '.dark &': {
          backgroundColor: theme('colors.gray-750'),
        },
      },

      '--tw-prose-invert-bullets': theme('colors.gray-500'),

      'li': {
        marginTop: '0.1rem',
        marginBottom: '0.1rem',
      },

      'code': {
        'backgroundColor': theme('colors.gray-500 / 20%'),
        'fontWeight': 'normal',
        'padding': '0.05rem 0.5rem',
        'borderRadius': '0.25rem',
        'fontSize': '0.8rem',

        '&::before, &::after': {
          display: 'none',
        },
      },
    },
  },
})
