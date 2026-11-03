import type { AuditReport } from '../messages.js'

/** One reported element to find again in a live report of the same variant. */
export interface NodeFinding {
  /** Outcome category of the rule. */
  outcome: 'violations' | 'incomplete'
  /** Axe rule id. */
  rule: string
  /** Selector chain of the element in the report it comes from. */
  selectors: readonly string[]
  /** Position of the element in its rule. */
  index: number
  /** Elements of the rule in the report it comes from. */
  count: number
}

/**
 * Element of a live report matching a finding from another report (a project run, the build
 * report). Same selectors win; selectors computed in another document only match by position,
 * and only when the rule reports as many elements, so a changed variant never highlights a guess.
 * @param report Live report of the variant.
 * @param finding Element to find.
 */
export function matchNode(report: Pick<AuditReport, 'violations' | 'incomplete'>, finding: NodeFinding) {
  const rule = report[finding.outcome].find(rule => rule.id === finding.rule)
  if (!rule) return
  const key = finding.selectors.join('\n')
  return rule.nodes.find(node => node.selectors.join('\n') === key) ?? (rule.nodes.length === finding.count ? rule.nodes[finding.index] : undefined)
}
