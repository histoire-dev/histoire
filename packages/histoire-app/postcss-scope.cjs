function isImportRule(node) {
  return node.type === 'atrule' && node.name === 'import'
}

module.exports = (opts = {}) => {
  const { from = ':root', to } = opts
  let params = `(${from})`
  if (to) {
    params += ` to (${to})`
  }

  return {
    postcssPlugin: 'postcss-scope-wrapper',
    Once(root, { AtRule }) {
      const scopeRule = new AtRule({
        name: 'scope',
        params,
      })

      const nodes = []

      root.each((node) => {
        if (isImportRule(node)) {
          nodes.push(node)
          return
        }

        if (node.type === 'rule') {
          node.selectors = node.selectors
            .map(selector => ['html', ':root'].includes(selector) ? ':scope' : selector)
        }

        scopeRule.append(node)
      })

      root.removeAll()

      nodes.forEach((node) => {
        root.append(node)
      })

      root.append(scopeRule)
    },
  }
}

module.exports.postcss = true
