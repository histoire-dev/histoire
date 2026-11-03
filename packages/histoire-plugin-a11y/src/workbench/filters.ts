import type { PluginPreferences } from '@histoire/plugin-kit'
import type { WritableComputedRef } from 'vue'
import type { ProjectFilter } from './project-model.js'
import { computed, onScopeDispose, ref } from 'vue'
import { IMPACTS } from '../scanner/policy.js'

/** Options of the outcome select. */
export const OUTCOME_OPTIONS = { violations: 'Violations', incomplete: 'Needs review' }

/** Options of the severity select. */
export const SEVERITY_OPTIONS = { all: 'All severities', critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor', unknown: 'Unknown' }

/**
 * Outcome and severity filters persisted in plugin preferences, shared by the inspector tab and
 * the project pane. Invalid stored values read as defaults. Must run in a component scope.
 * @param preferences Plugin preferences.
 */
export function useFindingFilters(preferences: PluginPreferences): { outcome: WritableComputedRef<ProjectFilter['outcome']>, severity: WritableComputedRef<string> } {
  // Preferences are not reactive: a change bumps this revision.
  const revision = ref(0)
  const stops = ['outcome', 'severity'].map(key => preferences.subscribe(key, () => revision.value++))
  onScopeDispose(() => stops.forEach(stop => stop()))
  const outcome = computed({
    get: () => {
      void revision.value
      return preferences.get<string>('outcome', 'violations') === 'incomplete' ? 'incomplete' as const : 'violations' as const
    },
    set: value => preferences.set('outcome', value),
  })
  const severity = computed({
    get: () => {
      void revision.value
      const value = preferences.get<string>('severity', 'all')
      return value === 'all' || value === 'unknown' || Object.hasOwn(IMPACTS, value) ? value : 'all'
    },
    set: value => preferences.set('severity', value),
  })
  return { outcome, severity }
}
