/** Preserve story layout defaults on legacy URLs, with explicit URL overrides first. */
export function resolveWorkbenchArrangement(query: unknown, storyLayout: unknown, localDefault?: 'grid' | 'list', projectDefault?: 'grid' | 'list'): 'grid' | 'list' | 'matrix' {
  if (query === 'grid' || query === 'list' || query === 'matrix') return query
  if (storyLayout === 'grid' || storyLayout === 'list') return storyLayout
  return localDefault ?? projectDefault ?? 'grid'
}
