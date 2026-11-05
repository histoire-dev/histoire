/** Primary catalog categories in display order. */
export const categories = ['testing', 'design', 'inspection', 'frameworks', 'data'] as const
/** Extension contribution categories supported by the marketplace. */
export const addKinds = ['rail-pane', 'inspector-tab', 'toolbar-tool', 'story-tests', 'cli-command', 'settings-section', 'canvas-view'] as const
/** Fallback tile palette. */
export const tints = ['green', 'violet', 'blue', 'amber', 'rose', 'sky', 'slate'] as const
/** Declared access categories, never runtime grants. */
export const accessKinds = ['story-frames', 'story-dom', 'network', 'filesystem', 'child-process'] as const
/** Preference choices; auto detection never becomes an executable name. */
export const packageManagers = ['auto', 'pnpm', 'npm', 'yarn', 'bun'] as const
/** Concrete executables in manual command order. */
export const executablePackageManagers = packageManagers.filter((name): name is Exclude<typeof packageManagers[number], 'auto'> => name !== 'auto')
