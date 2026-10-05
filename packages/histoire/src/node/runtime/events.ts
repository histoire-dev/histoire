import type { ServerStoryFile } from '@histoire/shared'

/** Internal inventory notifications; every subscriber belongs to one context. */
export interface ProjectEvents {
  /** Changed registered source, or a full collection request. */
  storyChanged: ServerStoryFile | undefined
  /** Registered story add/remove inventory changed. */
  storyListChanged: undefined
  /** Parsed Markdown contents or sibling associations changed. */
  markdownListChanged: undefined
}

/** Context-owned dispatch without a process-wide active project or listener list. */
export function createProjectEvents() {
  const handlers = new Map<keyof ProjectEvents, Set<(value: unknown) => unknown>>()
  return {
    /** Registers one observer and returns its idempotent scoped disposer. */
    on<K extends keyof ProjectEvents>(event: K, handler: (value: ProjectEvents[K]) => unknown) {
      let set = handlers.get(event)
      if (!set) handlers.set(event, set = new Set())
      const callback = handler as (value: unknown) => unknown
      set.add(callback)
      return () => {
        set.delete(callback)
      }
    },
    /** Observes asynchronous callback failures rather than leaking rejections. */
    emit<K extends keyof ProjectEvents>(event: K, value: ProjectEvents[K]) {
      for (const handler of [...handlers.get(event) ?? []]) {
        try {
          void Promise.resolve(handler(value)).catch(error => console.error(error))
        }
        catch (error) {
          console.error(error)
        }
      }
    },
    /** Removes callbacks before the owning generation releases its resources. */
    clear() { handlers.clear() },
  }
}
