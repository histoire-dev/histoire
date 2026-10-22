import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import type { createProjectFileIndex } from '../../comments/files-search.js'
import type { Context } from '../../context.js'
import { z } from 'zod'
import { ATTACHMENT_BYTES, readAttachment, saveAttachment } from '../../comments/attachments.js'
import { searchProjectFiles } from '../../comments/files-search.js'
import { readScreenshotFile } from './files.js'
import { isSameOriginPost, readBody, readJsonBody, RequestBodyTooLargeError, sendJson } from './http-body.js'
import { registerUiHttpRoute, uiHttpPath } from './http.js'

/**
 * Mounts comment file search, attachment upload, screenshot-to-attachment copy and attachment download under `/__histoire/comments/`.
 * @param ctx Dev context.
 * @param server Vite dev server.
 * @param index Shared project file index.
 * @param isActive Generation ownership.
 */
export function registerCommentsHttp(ctx: Context, server: ViteDevServer, index: ReturnType<typeof createProjectFileIndex>, isActive: () => boolean): () => void {
  const prefix = uiHttpPath(server, '/__histoire/comments/')
  return registerUiHttpRoute(server, prefix, (request: IncomingMessage, response: ServerResponse, next) => {
    const url = new URL(request.url!, 'http://localhost')
    const path = url.pathname.slice(prefix.length)
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    /** Each route keeps its own method, origin and payload validation. */
    async function run(): Promise<void> {
      if (path === 'files/search') {
        if (!isSameOriginPost(request)) return sendJson(response, 403, { error: 'Comment request refused' })
        const { query } = z.object({ query: z.string().max(256) }).strict().parse(await readJsonBody(request))
        return sendJson(response, 200, { files: searchProjectFiles(await index.files(), query, 20) })
      }
      if (path === 'attachments') {
        if (!isSameOriginPost(request, 'application/octet-stream')) return sendJson(response, 403, { error: 'Comment request refused' })
        const name = url.searchParams.get('name') ?? ''
        const type = url.searchParams.get('type') ?? ''
        if (!name || name.length > 256 || type.length > 128) return sendJson(response, 400, { error: 'Invalid attachment' })
        const bytes = await readBody(request, ATTACHMENT_BYTES).catch((error) => {
          throw error instanceof RequestBodyTooLargeError ? new Error('Attachment exceeds 10 MB') : error
        })
        return sendJson(response, 200, await saveAttachment(ctx.root, name, type, bytes))
      }
      if (path === 'attachments/from-screenshot') {
        if (!isSameOriginPost(request)) return sendJson(response, 403, { error: 'Comment request refused' })
        const { path: screenshot } = z.object({ path: z.string().max(512) }).strict().parse(await readJsonBody(request))
        const name = screenshot.split('/').pop()!
        // Only generated screenshots, read through the same checks as their image route.
        const file = screenshot === `.histoire/screenshots/${name}` ? await readScreenshotFile(ctx.root, name) : undefined
        if (!file) return sendJson(response, 400, { error: 'Screenshot unavailable' })
        return sendJson(response, 200, await saveAttachment(ctx.root, name, file.mimeType, file.bytes))
      }
      if (path.startsWith('attachments/') && request.method === 'GET') {
        const file = await readAttachment(ctx.root, decodeURIComponent(path.slice('attachments/'.length)))
        response.statusCode = file ? 200 : 404
        response.setHeader('content-type', file?.mimeType ?? 'text/plain')
        // Only verified images render inline; everything else downloads.
        if (file && !file.mimeType.startsWith('image/')) response.setHeader('content-disposition', 'attachment')
        response.end(file?.bytes ?? 'Attachment unavailable')
        return
      }
      next()
    }
    if (ctx.mode !== 'dev' || !isActive()) return sendJson(response, 404, { error: 'Comments unavailable' })
    void run().catch((error) => {
      if (response.headersSent) return response.destroy()
      sendJson(response, 400, { error: error instanceof Error && /10 MB|symlink/.test(error.message) ? error.message : 'Comment request failed' })
    })
  }, isActive)
}
