import type { Browser, LaunchOptions } from 'playwright'
import { importResolvedModule } from '../../util/import-resolved.js'
import { tryResolveDependency } from '../../util/resolve-package.js'
import { McpDomainError } from '../protocol/errors.js'

/** Injectable browser acquisition; never executed during operation admission. */
export type LaunchPreviewBrowser = (options: LaunchOptions) => Promise<Browser>

/** Resolve project-first optional peer without evaluating it during catalog reads. */
export async function resolvePreviewBrowser(root: string): Promise<LaunchPreviewBrowser> {
  const resolved = tryResolveDependency(root, 'playwright')
  if (!resolved) throw new McpDomainError('DEPENDENCY_MISSING', 'Install playwright in project: pnpm add -D playwright')
  const module = await importResolvedModule<typeof import('playwright') & { default?: typeof import('playwright') }>(resolved)
  // require.resolve selects Playwright's CommonJS entry. Node may expose that
  // module only through default rather than synthesizing its re-export names.
  const chromium = module.chromium ?? module.default?.chromium
  if (!chromium?.launch) throw new McpDomainError('DEPENDENCY_MISSING', 'Project playwright does not provide Chromium')
  return async (options) => {
    try {
      return await chromium.launch(options)
    }
    catch {
      throw new McpDomainError('BROWSER_UNAVAILABLE', 'Chromium could not launch. Install browser with: pnpm exec playwright install chromium', true)
    }
  }
}
