
const inheritedConfig = require('../../tailwind.config.cjs')
const defaultColors = require('tailwindcss/colors')

// Colors

function withOpacityValue (variable) {
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

const colors = {
  ...{
    ...defaultColors,
    gray: undefined,
  },
  white: '#fff',
  black: '#000',
  transparent: 'transparent',
  ...themedColors,
}

module.exports = {
  ...inheritedConfig,
  content: [
    './src/**/*.{vue,js,ts,jsx,tsx,md}',
  ],
  corePlugins: {
    preflight: false,
  },
}

delete module.exports.theme.extend.colors.primary
delete module.exports.theme.extend.colors.gray
module.exports.theme.colors = colors
