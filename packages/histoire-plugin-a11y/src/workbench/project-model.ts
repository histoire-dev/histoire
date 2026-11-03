import type { A11yImpact } from '../options.js'
import type { A11yResult } from './sources.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { IMPACTS } from '../scanner/policy.js'

/** One bounded rule of a report. */
export type AuditRule = NonNullable<A11yResult['report']>['violations'][number]

/** Filters shared with the inspector tab preferences. */
export interface ProjectFilter {
  /** Violations or rules needing review. */
  outcome: 'violations' | 'incomplete'
  /** `all`, `unknown` or one axe impact. */
  severity: string
}

/** Display titles of one variant. */
export interface VariantTitles {
  /** Story title. */
  story: string
  /** Variant title. */
  variant: string
}

/** Variant row of the project pane. */
export interface ProjectGroup extends A11yResult {
  /** Stable row key. */
  key: string
  /** Story title, falling back to its id. */
  storyTitle: string
  /** Variant title, falling back to its id. */
  variantTitle: string
  /** Matching rules, worst impact first. */
  findings: AuditRule[]
}

/** Totals shown in the pane summary and badge. */
export interface ProjectTotals {
  /** Variants with a report. */
  checked: number
  /** Checked variants with at least one violation. */
  affected: number
  /** Violating rules summed over variants. */
  violations: number
  /** Variants whose check failed without a report. */
  failed: number
}

/** Weight of a rule impact; unknown impact sorts after known ones. */
function weight(rule: AuditRule): number {
  return IMPACTS[rule.impact as A11yImpact] ?? 0
}

/**
 * Most severe known impact among rules, for coloring counts; `undefined` when none is known.
 * @param rules Rules to scan.
 */
export function worstImpact(rules: readonly AuditRule[]): A11yImpact | undefined {
  let worst: AuditRule | undefined
  for (const rule of rules) {
    if (weight(rule) > (worst ? weight(worst) : 0)) worst = rule
  }
  return worst?.impact as A11yImpact | undefined
}

/**
 * Canvas frame header badge of a report: violation count, colored by the worst impact.
 * `null` without violations, so clean variants stay quiet.
 * @param report Report of the variant, if any.
 */
export function violationBadge(report: A11yResult['report']) {
  if (!report?.violationsCount) return null
  const impact = worstImpact(report.violations)
  const tone = impact === 'critical' || impact === 'serious' ? 'danger' as const : impact === 'moderate' ? 'warning' as const : 'neutral' as const
  return { text: report.violationsCount, tone, label: `${report.violationsCount} accessibility ${report.violationsCount === 1 ? 'violation' : 'violations'}` }
}

/**
 * Builds pane rows: variants with matching findings and variants whose check failed. Failed
 * checks come first, then variants by worst matching impact, then by title.
 * @param results Results of the active source.
 * @param titles Resolves display titles; `undefined` falls back to ids.
 * @param filter Outcome and severity filter.
 */
export function projectGroups(results: readonly A11yResult[], titles: (target: A11yResult['target']) => VariantTitles | undefined, filter: ProjectFilter) {
  const totals: ProjectTotals = { checked: 0, affected: 0, violations: 0, failed: 0 }
  const groups: ProjectGroup[] = []
  for (const result of results) {
    if (result.report) {
      totals.checked++
      totals.violations += result.report.violationsCount
      if (result.report.violationsCount) totals.affected++
    }
    else if (result.error) {
      totals.failed++
    }
    const findings = [...result.report?.[filter.outcome] ?? []]
      .filter(rule => filter.severity === 'all' || (rule.impact ?? 'unknown') === filter.severity)
      .sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id))
    if (!findings.length && !(result.error && !result.report)) continue
    const title = titles(result.target)
    groups.push({ ...result, key: getHistoireTargetKey(result.target), storyTitle: title?.story ?? result.target.storyId, variantTitle: title?.variant ?? result.target.variantId, findings })
  }
  const rank = (group: ProjectGroup) => group.report ? (group.findings[0] ? weight(group.findings[0]) : 0) : Number.POSITIVE_INFINITY
  groups.sort((a, b) => rank(b) - rank(a) || a.storyTitle.localeCompare(b.storyTitle) || a.variantTitle.localeCompare(b.variantTitle))
  return { groups, totals }
}
