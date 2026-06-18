const path = require('pathe')
const defaultColors = require('tailwindcss/colors')
const inheritedConfig = require('../../tailwind.config.cjs')

// Colors

function withOpacityValue(variable) {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) {
      return `rgb(var(${variable}))`
    }
    return `rgb(var(${variable}) / ${opacityValue})`
  }
}

const colorKeys = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
const grayKeys = [...colorKeys, 750, 850, 950]
const themedColors = ['primary', 'gray'].reduce((acc, color) => {
  const keys = (color === 'gray' ? grayKeys : colorKeys)
  for (const key of keys) {
    acc[`${color}-${key}`] = withOpacityValue(`--_histoire-color-${color}-${key}`)
  }
  return acc
}, {})

const excludedDefaultColors = [
  // Grays
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  // Deprecated colors
  'lightBlue',
  'warmGray',
  'trueGray',
  'coolGray',
  'blueGray',
]

const includedDefaultColors = {}
for (const key in defaultColors) {
  if (!excludedDefaultColors.includes(key)) {
    includedDefaultColors[key] = defaultColors[key]
  }
}

const colors = {
  ...includedDefaultColors,
  white: '#fff',
  black: '#000',
  transparent: 'transparent',
  ...themedColors,
}

module.exports = {
  ...inheritedConfig,
  prefix: 'htw-',
  content: [
    path.resolve(__dirname, './src/**/*.{vue,js,ts,jsx,tsx,md}'),
    // Include controls CSS directly
    path.resolve(__dirname, '../histoire-controls/src/**/*.{vue,js,ts,jsx,tsx,md}'),
  ],
  corePlugins: {
    preflight: false,
  },
}

delete module.exports.theme.extend.colors.primary
delete module.exports.theme.extend.colors.gray
module.exports.theme.colors = colors

module.exports.plugins.push(require('@tailwindcss/typography'))

module.exports.theme.extend.typography = theme => ({
  DEFAULT: {
    css: {
      // Custom style
      'table': {
        borderCollapse: 'collapse',
      },
      'thead, tr, blockquote': {
        borderStyle: 'solid',
      },
      'blockquote': {
        marginInlineStart: '0.375rem',
        marginInlineEnd: '0.375rem',
      },

      // Theme variables
      // Light
      '--tw-prose-links': theme('colors.primary-500'),
      '--tw-prose-pre-bg': theme('colors.gray-800'),
      // Dark
      '--tw-prose-invert-links': theme('colors.primary-500'),
      '--tw-prose-invert-quote-borders': theme('colors.gray-500'),
      '--tw-prose-invert-hr': theme('colors.gray-500'),
      '--tw-prose-invert-th-borders': theme('colors.gray-500'),
      '--tw-prose-invert-td-borders': theme('colors.gray-600'),
      '--tw-prose-invert-bullets': theme('colors.gray-500'),
      '--tw-prose-invert-pre-bg': theme('colors.gray-800'),
    },
  },
})
