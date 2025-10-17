module.exports = {
  plugins: [
    require('postcss-import'),
    require('tailwindcss/nesting'),
    require('tailwindcss')('./tailwind.config.cjs'),
    require('autoprefixer'),
    require('./postcss-scope-wrapper.cjs')({ from: ':root', to: '.__histoire-render-story:not(.__histoire-render-custom-controls)' }),
  ],
}
