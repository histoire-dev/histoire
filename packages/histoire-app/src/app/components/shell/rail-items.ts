import type { ShellPane } from '../../stores/shell.js'

/** Badge color semantics: failures, agent activity, or an agent waiting for the user. */
export type RailBadgeTone = 'danger' | 'agent' | 'attention'

/** One finite descriptor drives rail labeling, iconography, and mode filtering. */
export interface RailItem {
  /** Persisted local pane identity. */
  id: ShellPane
  /** Accessible action label. */
  label: string
  /** Bundled Carbon icon without collection prefix. */
  icon: string
  /** Capability absent from static books. */
  devOnly?: boolean
  /** Status color semantics from tests or connected agent services. */
  badgeTone?: RailBadgeTone
}

/** Home navigation remains standalone-owned; other entries change local panels. */
export const railItems: readonly RailItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'stories', label: 'Stories', icon: 'catalog' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'tests', label: 'Tests', icon: 'chemistry', devOnly: true, badgeTone: 'danger' },
  { id: 'ai', label: 'AI', icon: 'bot', devOnly: true, badgeTone: 'agent' },
]
