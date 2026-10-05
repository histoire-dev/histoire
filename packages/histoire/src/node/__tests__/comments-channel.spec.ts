import type { Context } from '../context.js'
import type { CommentsAgentBridge } from '../server/ui-channel/comments.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { writeCommentsFile } from '../comments/file.js'
import { registerCommentsChannel } from '../server/ui-channel/comments.js'
import { commentDraft, commentFixture, commentMessages, commentStory } from './utils/comments.js'
import { createMcpProjectFixture } from './utils/mcp/project.js'
import { uiChannelFixture } from './utils/ui-channel.js'

describe('comments agent bridge', () => {
  it('lets ACP authorize user presets absent from project config, retaining structured context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-channel-'))
    const fixture = uiChannelFixture()
    const draft = commentDraft()
    const prompt = vi.fn<CommentsAgentBridge['prompt']>(async () => ({ text: 'Fixed loading width' }))
    const ctx = { mode: 'dev', root, config: { comments: { enabled: true }, agents: { presets: [] } }, storyFiles: [{ relativePath: 'src/Button.story.vue', story: commentStory }] } as unknown as Context
    const store = registerCommentsChannel(ctx, fixture.channel, { prompt, cancel: vi.fn() })
    try {
      await fixture.request('histoire:ui:comment-send', { ids: [draft.id], agentId: 'user-preset', draft })
      expect(prompt).toHaveBeenCalledOnce()
      expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'user-preset', threadId: draft.id, context: { storyId: draft.storyId, variantId: draft.variantId, props: draft.props, selector: draft.anchor.selector, source: 'src/Button.story.vue', screenshot: undefined } }))
      expect(prompt.mock.calls[0][0].text).not.toContain('src/Button.story.vue')
      expect(await store.list()).toMatchObject([{ status: 'replied', agentId: 'user-preset', thread: [{ body: 'Fixed loading width' }] }])
    }
    finally {
      await fixture.channel.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports explicit capacity before dispatch without erasing a full conversation', async () => {
    const project = await createMcpProjectFixture()
    const fixture = uiChannelFixture()
    const comment = commentFixture({ thread: commentMessages(64, 'Completed', 'agent') })
    const prompt = vi.fn<CommentsAgentBridge['prompt']>(async () => ({ text: 'Completed' }))
    const ctx = { mode: 'dev', root: project.root, config: { comments: { enabled: true }, agents: { presets: [] } }, storyFiles: [{ relativePath: 'src/Button.story.vue', story: commentStory }] } as unknown as Context
    await writeCommentsFile(project.root, '.histoire/comments.json', [comment])
    const store = registerCommentsChannel(ctx, fixture.channel, { prompt, cancel: vi.fn() })
    try {
      await fixture.request('histoire:ui:comment-send', { ids: [comment.id], agentId: 'agent', requestId: 'a2c11111-1111-4111-8111-111111111111' })
      expect(prompt).not.toHaveBeenCalled()
      expect(await store.list()).toEqual([comment])
      expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:comments-snapshot', expect.objectContaining({ error: 'Comment reply capacity reached. Start a new comment to continue; existing history is preserved.', requestId: 'a2c11111-1111-4111-8111-111111111111' }))
    }
    finally {
      await fixture.channel.close()
      await project.close()
    }
  })
})
