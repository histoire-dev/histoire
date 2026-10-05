/** Scope every peer stylesheet rule, including imported FloatingVue and SFC styles. */
const scope = {
  postcssPlugin: 'histoire-peer-root',
  OnceExit(root) {
    root.walkRules((rule) => {
      let parent = rule.parent
      while (parent) {
        if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return
        parent = parent.parent
      }
      rule.selectors = rule.selectors.map(selector => `.histoire-provider ${selector}`)
    })
  },
}
module.exports = {
  plugins: [
    require('postcss-import'),
    require('tailwindcss/nesting'),
    require('tailwindcss')('./tailwind.peer.config.cjs'),
    require('autoprefixer'),
    scope,
  ],
}
