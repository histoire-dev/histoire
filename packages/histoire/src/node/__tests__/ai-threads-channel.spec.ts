import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { saveAttachment } from '../comments/attachments.js'
import { aiThreadsChannelFixture } from './utils/ai-threads-channel.js'
import { commentStory, PNG_BYTES } from './utils/comments.js'
import { disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

describe('aI threads channel', () => {
  it('creates a thread and sends story conventions plus optional story context to the agent', async () => {
    const { root, fixture, prompt, store } = await aiThreadsChannelFixture()
    prompt.mockResolvedValueOnce({ text: 'Created Meow.story.vue', changes: [{ file: 'src/Meow.story.vue', added: 20, removed: 0 }] })
    const id = randomUUID()
    await fixture.request('histoire:ui:ai-thread-create', { draft: { id, body: 'Create a story for Meow.vue\nwith all sizes', context: { storyId: commentStory.id, variantId: 'loading:small' } }, agentId: 'claude' })
    const request = prompt.mock.calls[0][0]
    expect(request).toMatchObject({ agentId: 'claude', threadId: id, context: { storyId: commentStory.id, variantId: 'loading:small', source: 'src/Button.story.vue' } })
    expect(request.text).toContain('Create a story for Meow.vue')
    expect(request.text).toContain('**/*.story.vue')
    expect(request.text).toContain('src/Button.story.vue')
    expect(await store.list()).toMatchObject([{ id, title: 'Create a story for Meow.vue', status: 'replied', thread: [{ author: 'agent', changes: [{ file: 'src/Meow.story.vue' }] }] }])
    expect(JSON.parse(await readFile(join(root, '.histoire/threads.json'), 'utf8'))).toMatchObject({ version: 1, threads: [{ id }] })
  })

  it('continues the same agent conversation on reply', async () => {
    const { fixture, prompt, store } = await aiThreadsChannelFixture()
    const id = randomUUID()
    await fixture.request('histoire:ui:ai-thread-create', { draft: { id, body: 'Create a story' }, agentId: 'claude' })
    await fixture.request('histoire:ui:ai-thread-reply', { id, body: 'Add a dark variant', agentId: 'other' })
    expect(prompt).toHaveBeenCalledTimes(2)
    expect(prompt.mock.calls[1][0]).toMatchObject({ agentId: 'claude', threadId: id })
    expect(prompt.mock.calls[1][0].text).toContain('Add a dark variant')
    expect((await store.list())[0].thread).toHaveLength(3)
  })

  it('rejects story context that is not collected', async () => {
    const { fixture, prompt, store } = await aiThreadsChannelFixture()
    await fixture.request('histoire:ui:ai-thread-create', { draft: { id: randomUUID(), body: 'Fix it', context: { storyId: 'missing' } }, agentId: 'claude' })
    expect(prompt).not.toHaveBeenCalled()
    expect(await store.list()).toEqual([])
  })

  it('sends only commands the agent announced raw and wraps other leading slashes', async () => {
    const { fixture, prompt } = await aiThreadsChannelFixture({ bridge: { commandNames: () => ['review'] } })
    await fixture.request('histoire:ui:ai-thread-create', { draft: { id: randomUUID(), body: '/review src' }, agentId: 'claude' })
    await fixture.request('histoire:ui:ai-thread-create', { draft: { id: randomUUID(), body: '/api returns 500' }, agentId: 'claude' })
    expect(prompt.mock.calls[0][0]).toMatchObject({ command: true, text: '/review src' })
    expect(prompt.mock.calls[1][0].command).toBe(false)
    expect(prompt.mock.calls[1][0].text).toContain('User request:\n/api returns 500')
  })

  it('flags attachments of earlier messages so a reused session skips them', async () => {
    const { root, fixture, prompt } = await aiThreadsChannelFixture()
    const id = randomUUID()
    const first = await saveAttachment(root, 'first.png', 'image/png', PNG_BYTES)
    const second = await saveAttachment(root, 'second.png', 'image/png', PNG_BYTES)
    await fixture.request('histoire:ui:ai-thread-create', { draft: { id, body: 'Create a story', attachments: [first] }, agentId: 'claude' })
    await fixture.request('histoire:ui:ai-thread-reply', { id, body: 'And this one', attachments: [second] })
    expect(prompt.mock.calls[0][0].files).toEqual([{ path: first.path, name: 'first.png', mimeType: 'image/png' }])
    expect(prompt.mock.calls[1][0].files).toEqual([{ path: first.path, name: 'first.png', mimeType: 'image/png', earlier: true }, { path: second.path, name: 'second.png', mimeType: 'image/png' }])
  })
})
