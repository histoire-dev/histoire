import { withVisualLock } from './files.js'

/** Retry short cache publications; baseline approvals still fail contested locks explicitly. */
export async function withVisualCacheLock<T>(root: string, key: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withVisualLock(root, `cache:${key}`, operation)
    }
    catch (error) {
      if (attempt >= 99 || !(error instanceof Error) || !error.message.includes('locked')) throw error
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
}
