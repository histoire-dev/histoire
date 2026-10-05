const fs = require('node:fs')
const path = require('node:path')

module.exports = {
  plugins: [
    require('postcss-import')({
      // postcss-import's legacy resolver does not read package export maps.
      resolve(id, basedir) {
        const local = path.resolve(basedir, id)
        return fs.existsSync(local) ? local : require.resolve(id, { paths: [basedir] })
      },
    }),
    require('tailwindcss/nesting'),
    require('tailwindcss')('./tailwind.config.cjs'),
    require('autoprefixer'),
    require('./postcss-scope-wrapper.cjs')({ from: ':root', to: '.__histoire-render-story:not(.__histoire-render-custom-controls)' }),
  ],
}
