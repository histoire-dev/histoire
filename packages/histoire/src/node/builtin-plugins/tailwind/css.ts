import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

/** Scope selectors structurally so escaped utility names and contextual themes survive. */
function scopeSelector(selector: string, scope: string, utility: boolean): string {
  return selectorParser((root) => {
    root.each((part) => {
      let rootSelector = false
      part.walkPseudos((pseudo) => {
        if (pseudo.value === ':root' || pseudo.value === ':host') {
          const target = selectorParser().astSync(scope).first.nodes[0].clone()
          const conditionalRoot = pseudo.value === ':root' && (
            (pseudo.prev() && pseudo.prev().type !== 'combinator')
            || (pseudo.next() && pseudo.next().type !== 'combinator')
          )
          if (conditionalRoot) {
            // A qualified document root owns its condition (e.g. dark class
            // or theme attribute). Apply its variables beneath that context,
            // without requiring the generated source div to carry the marker.
            let last = pseudo as selectorParser.Node
            while (last.next() && last.next().type !== 'combinator') last = last.next()
            const separator = selectorParser.combinator({ value: ' ' })
            last.parent.insertAfter(last, separator)
            last.parent.insertAfter(separator, target)
          }
          else {
            pseudo.replaceWith(target)
          }
          rootSelector = true
        }
      })
      if (!rootSelector) {
        // Theme classes may live above the story root; also support class on
        // root itself via :is() rather than accidentally requiring a child.
        if (!utility && /^\.[\w-]+$/.test(part.toString())) {
          part.replaceWith(selectorParser().astSync(`:is(${scope}${part}, ${part} ${scope})`).first)
        }
        else {
          part.prepend(selectorParser.combinator({ value: ' ' }))
          part.prepend(selectorParser().astSync(scope).first.nodes[0].clone())
        }
      }
    })
  }).processSync(selector)
}

/** Keep source variables/resources, strip application rules and preflight, then scope utilities. */
export function scopeTailwindCss(css: string, id: string, candidates: Set<string>, variables: Record<string, string>): string {
  const scope = `[data-tailwind-source="${id}"]`
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && rule.parent.name.endsWith('keyframes')) {
      rule.remove()
      return
    }
    let utility = false
    try {
      selectorParser(selectors => selectors.walkClasses((node) => {
        if (candidates.has(node.value)) utility = true
      })).processSync(rule.selector)
    }
    catch {
      rule.remove()
      return
    }
    if (!utility) {
      // Variable-only authored theme rules remain meaningful to inline tokens.
      for (const node of [...rule.nodes]) {
        if (node.type !== 'decl' || !node.prop.startsWith('--')) node.remove()
      }
      if (!rule.nodes.length) {
        rule.remove()
        return
      }
    }
    rule.selector = scopeSelector(rule.selector, scope, utility)
  })
  root.walkAtRules((rule) => {
    if (/^(?:charset|import|keyframes|source|reference)$/.test(rule.name)) rule.remove()
  })
  // All resolved theme entries are available, including unused/inline values
  // omitted by compiler pruning. Authored conditional rules override them.
  const declarations = postcss.rule({ selector: scope })
  for (const [prop, value] of Object.entries(variables)) declarations.append(postcss.decl({ prop, value }))
  // Defaults must share compiler's theme layer. Unlayered defaults would beat
  // authored @layer base dark/theme overrides regardless of specificity.
  const theme = root.nodes.find(node => node.type === 'atrule' && node.name === 'layer' && node.params === 'theme' && node.nodes)
  if (theme?.type === 'atrule') theme.prepend(declarations)
  else root.prepend(postcss.atRule({ name: 'layer', params: 'theme', nodes: [declarations] }))
  return root.toString()
}
