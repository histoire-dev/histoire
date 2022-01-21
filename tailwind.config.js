// @ts-nocheck
/* eslint-disable @typescript-eslint/no-var-requires */

const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
  theme: {
    extend: {
      maxWidth: theme => ({
        ...theme('width'),
      }),

      maxHeight: theme => ({
        ...theme('height'),
      }),

      minWidth: theme => ({
        ...theme('width'),
      }),

      minHeight: theme => ({
        ...theme('height'),
      }),

      screens: Object.keys(defaultTheme.screens).reduce((obj, key) => {
        const [rawMin] = defaultTheme.screens[key].split('px')
        const max = parseInt(rawMin) - 1
        obj[`!${key}`] = { max: `${max}px` }
        return obj
      }, {}),

      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },

      cursor: {
        'ew-resize': 'ew-resize',
        'ns-resize': 'ns-resize',
        'cursor-not-allowed': 'cursor-not-allowed',
      },
    },
  },
  content: [
    './docs/**/*.{vue,js,ts,jsx,tsx,md}',
    './docs/.vitepress/**/*.{vue,js,ts,jsx,tsx,md}',
  ],
  darkMode: 'class', // or 'media' or 'class'
  plugins: [],
}
