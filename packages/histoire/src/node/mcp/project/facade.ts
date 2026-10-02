import type { z } from 'zod/v4'
import type { McpDocsResult, McpSourceResult } from '../protocol/content-schema.js'
import type { mcpListStoriesResultSchema, McpProject } from '../protocol/project-schema.js'
import type { mcpPreviewResultSchema, mcpStoryResultSchema } from '../protocol/story-schema.js'
import type { McpToolInput } from '../protocol/tool-schema.js'

/** A read may be backed by an immutable artifact or asynchronous dev content. */
export type McpRead<T> = T | Promise<T>
/** Bounded published catalog page. */
export type McpStoriesResult = z.infer<typeof mcpListStoriesResultSchema>
/** Exact story metadata and resource references. */
export type McpStoryResult = z.infer<typeof mcpStoryResultSchema>
/** Exact story/variant preview links. */
export type McpPreviewResult = z.infer<typeof mcpPreviewResultSchema>

/** Transport-neutral public boundary; no Context, Vite or project modules. */
export interface HistoireMcpProject {
  /** Stable opaque identity for this controller's lifetime. */
  readonly projectId: string
  /** Lifecycle is readable before first collection and after failures. */
  getProject: (signal?: AbortSignal) => McpRead<McpProject>
  /** Search one published snapshot without extra collection. */
  listStories: (input: McpToolInput<'histoire_list_stories'>, signal?: AbortSignal) => McpRead<McpStoriesResult>
  /** Resolve exact story and associated canonical resources. */
  getStory: (input: McpToolInput<'histoire_get_story'>, signal?: AbortSignal) => McpRead<McpStoryResult>
  /** Page original documentation through catalog authority. */
  getDocs: (input: McpToolInput<'histoire_get_docs'>, signal?: AbortSignal) => McpRead<McpDocsResult>
  /** Page raw source through catalog authority. */
  getSource: (input: McpToolInput<'histoire_get_source'>, signal?: AbortSignal) => McpRead<McpSourceResult>
  /** Resolve links without launching a browser. */
  getPreview: (input: McpToolInput<'histoire_get_preview'>, signal?: AbortSignal) => McpRead<McpPreviewResult>
}
