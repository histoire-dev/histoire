import type { ShellPane } from '../../stores/shell.js'

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
  badgeTone?: 'danger' | 'agent' | 'mcp'
}

/** Home navigation remains standalone-owned; other entries change local panels. */
export const railItems: readonly RailItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'stories', label: 'Stories', icon: 'catalog' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'tests', label: 'Tests', icon: 'chemistry', devOnly: true, badgeTone: 'danger' },
  { id: 'comments', label: 'Comments', icon: 'chat', devOnly: true, badgeTone: 'agent' },
  { id: 'mcp', label: 'MCP activity', icon: 'bot', devOnly: true, badgeTone: 'mcp' },
]
