const path = require('pathe')
const defaultColors = require('tailwindcss/colors')
const inheritedConfig = require('../../tailwind.config.cjs')

// Colors

/** Source color alpha and utility opacity compose without escaping owning root. */
function withOpacityValue(variable, alphaVariable = `${variable}-alpha`) {
  return ({ opacityValue }) => {
    return `rgb(var(${variable}) / calc(var(${alphaVariable}, 1) * ${opacityValue ?? 1}))`
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

/** Semantic colors share root-scoped channels with authored workbench styles. */
const semanticColors = Object.fromEntries([
  'surface',
  'canvas',
  'home',
  'border',
  'chip',
  'input',
  'text',
  'body',
  'muted',
  'accent',
  'accent-soft',
  'accent-text',
  'accent-link',
  'danger',
  'danger-text',
  'danger-soft',
  'warn',
  'agent',
  'agent-text',
  'agent-soft',
  'measure',
  'code',
].map(name => [name, withOpacityValue(`--histoire-${name}-rgb`, `--histoire-${name}-alpha`)]))

const colors = {
  ...includedDefaultColors,
  white: '#fff',
  black: '#000',
  transparent: 'transparent',
  ...themedColors,
  ...semanticColors,
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
module.exports.theme.extend.fontFamily = {
  sans: ['var(--histoire-font-sans, "Manrope", system-ui, sans-serif)'],
  mono: ['var(--histoire-font-mono, "JetBrains Mono", ui-monospace, monospace)'],
}

module.exports.plugins.push(require('@tailwindcss/typography'))
// prose-a:htw-text-primary-500 prose-headings:htw-mb-2 prose-headings:htw-mt-4 first:prose-headings:htw-mt-0 prose-blockquote:htw-ml-0
module.exports.theme.extend.typography = theme => ({
  DEFAULT: {
    css: {
      'a': {
        'color': theme('colors.primary-500'),
        'textDecoration': 'none',

        '&:hover': {
          textDecoration: 'underline',
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
