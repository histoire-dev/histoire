import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveAttachment } from '../comments/attachments.js'
import { writeCommentsFile } from '../comments/file.js'
import { saveScreenshotFile } from '../server/ui-channel/files.js'
import { aiThreadsChannelFixture } from './utils/ai-threads-channel.js'
import { commentAttachment, commentDraft, commentFixture, commentMessages, commentStory, PNG_BYTES } from './utils/comments.js'
import { disposeConfigProjects } from './utils/config-codemod.js'
import { deferred } from './utils/mcp/deferred.js'

afterEach(disposeConfigProjects)

/** Request identity correlating a failure snapshot with its composer. */
const REQUEST_ID = 'a2c11111-1111-4111-8111-111111111111'

/** Generic controlled failure notice of the channel. */
const FAILED = 'AI thread action failed. Reload and retry.'

describe('pinned threads (canvas comments)', () => {
  it('sends canvas wording with structured canvas context, keeping source out of the text', async () => {
    const { fixture, prompt, store } = await aiThreadsChannelFixture()
    const draft = commentDraft()
    prompt.mockResolvedValueOnce({ text: 'Fixed loading width' })
    await fixture.request('histoire:ui:ai-thread-create', { draft, agentId: 'user-preset' })
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'user-preset', threadId: draft.id, context: { storyId: draft.context!.storyId, variantId: draft.context!.variantId, props: draft.props, selector: draft.anchor!.selector, source: 'src/Button.story.vue', screenshot: undefined } }))
    expect(prompt.mock.calls[0][0].text).toContain('User comment:\nKeep width while loading')
    expect(prompt.mock.calls[0][0].text).not.toContain('src/Button.story.vue')
    expect(await store.list()).toMatchObject([{ status: 'replied', agentId: 'user-preset', anchor: draft.anchor, thread: [{ body: 'Fixed loading width' }] }])
  })

  it('refuses unavailable targets and screenshots, accepting a screenshot of the same variant', async () => {
    const docsOnly = { ...commentStory, id: 'docs:only', docsOnly: true }
    const { root, ctx, fixture, store, errors } = await aiThreadsChannelFixture()
    ctx.storyFiles.push({ relativePath: 'src/Docs.story.md', story: docsOnly } as any)
    const other = await saveScreenshotFile(root, { storyId: 'button:one', variantId: 'other' }, 'png', PNG_BYTES)
    const own = await saveScreenshotFile(root, { storyId: 'button:one', variantId: 'loading:small' }, 'png', PNG_BYTES)
    const base = commentDraft()
    const bad = [
      { ...commentDraft(), context: { storyId: 'button:one', variantId: 'missing' } },
      { ...commentDraft(), context: { storyId: docsOnly.id, variantId: 'loading:small' } },
      { ...commentDraft(), context: { storyId: 'button:one' } },
      { ...commentDraft(), screenshot: other.path },
      { ...commentDraft(), screenshot: '.histoire/screenshots/missing.png' },
    ]
    for (const draft of bad) await fixture.request('histoire:ui:ai-thread-save', { draft, requestId: REQUEST_ID })
    expect(errors()).toEqual(bad.map(() => FAILED))
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:ai-threads-snapshot', expect.objectContaining({ requestId: REQUEST_ID }))
    await fixture.request('histoire:ui:ai-thread-save', { draft: { ...base, screenshot: own.path } })
    expect(await store.list()).toMatchObject([{ id: base.id, screenshot: own.path, status: 'draft', thread: [] }])
  })

  it('saves drafts without sending and refuses edits while the agent works', async () => {
    const finish = deferred<{ text: string }>()
    const { fixture, prompt, store, errors } = await aiThreadsChannelFixture()
    const draft = commentDraft()
    await fixture.request('histoire:ui:ai-thread-save', { draft })
    expect(prompt).not.toHaveBeenCalled()
    expect(await store.list()).toMatchObject([{ id: draft.id, title: draft.body, status: 'draft' }])
    prompt.mockReturnValueOnce(finish.promise)
    const sending = fixture.request('histoire:ui:ai-thread-create', { draft, agentId: 'agent' })
    await vi.waitFor(() => expect(prompt).toHaveBeenCalled())
    await fixture.request('histoire:ui:ai-thread-save', { draft: { ...draft, body: 'Edited' }, requestId: REQUEST_ID })
    expect(errors()).toEqual([FAILED])
    finish.resolve({ text: 'Done' })
    await sending
    expect(await store.list()).toMatchObject([{ body: draft.body, status: 'replied' }])
  })

  it('refuses anchored drafts when comments are disabled and publishes it', async () => {
    const { fixture, store, errors } = await aiThreadsChannelFixture({ config: { comments: { enabled: false } } })
    await fixture.request('histoire:ui:ai-thread-save', { draft: commentDraft() })
    await fixture.request('histoire:ui:ai-thread-save', { draft: { ...commentDraft(), anchor: undefined, props: undefined } })
    expect(errors()).toEqual([FAILED])
    expect(fixture.client.send).toHaveBeenCalledWith('histoire:ui:ai-threads-snapshot', expect.objectContaining({ enabled: true, pinsEnabled: false }))
    expect((await store.list()).map(thread => thread.anchor)).toEqual([undefined])
  })

  it('imports legacy comments before the first snapshot', async () => {
    const { title: _title, context, ...legacy } = commentFixture()
    const { fixture } = await aiThreadsChannelFixture({ before: async (root) => {
      await mkdir(join(root, '.histoire'))
      await writeFile(join(root, '.histoire/comments.json'), JSON.stringify({ version: 1, comments: [{ ...legacy, ...context }] }))
    } })
    await fixture.request('histoire:ui:ready', {})
    await vi.waitFor(() => expect(fixture.client.send).toHaveBeenCalledWith('histoire:ui:ai-threads-snapshot', expect.objectContaining({ pinsEnabled: true, threads: [expect.objectContaining({ id: legacy.id, context, anchor: legacy.anchor })] })))
  })

  it('refuses forged, missing or wrong-size attachments with the controlled error', async () => {
    const { root, fixture, prompt, store, errors } = await aiThreadsChannelFixture()
    const saved = await saveAttachment(root, 'a.png', 'image/png', PNG_BYTES)
    const existing = commentDraft()
    await store.upsert(existing)
    const bad = [commentAttachment(), { ...saved, size: saved.size + 1 }, { ...saved, path: '.histoire/attachments/../threads.json' }]
    for (const attachment of bad) {
      await fixture.request('histoire:ui:ai-thread-create', { draft: { ...commentDraft(), attachments: [attachment] }, agentId: 'agent' })
      await fixture.request('histoire:ui:ai-thread-reply', { id: existing.id, body: 'With file', agentId: 'agent', attachments: [attachment] })
    }
    expect(errors()).toEqual(Array.from({ length: 6 }, () => FAILED))
    expect(prompt).not.toHaveBeenCalled()
    expect(await store.list()).toMatchObject([{ id: existing.id, thread: [] }])
  })

  it('persists send options and reuses them for a later reply without options', async () => {
    const { fixture, prompt, store } = await aiThreadsChannelFixture()
    const draft = commentDraft()
    const options = { model: 'fast', effort: 'high' }
    await fixture.request('histoire:ui:ai-thread-create', { draft, agentId: 'agent', options })
    expect((await store.list())[0].options).toEqual(options)
    await fixture.request('histoire:ui:ai-thread-reply', { id: draft.id, body: 'Again' })
    expect(prompt.mock.calls.map(([request]) => request.options)).toEqual([options, options])
  })

  it('sends announced slash commands raw and wraps other leading slashes in canvas wording', async () => {
    const { fixture, prompt } = await aiThreadsChannelFixture({ bridge: { commandNames: () => ['review'] } })
    await fixture.request('histoire:ui:ai-thread-create', { draft: commentDraft('/review the button'), agentId: 'agent' })
    await fixture.request('histoire:ui:ai-thread-create', { draft: commentDraft('/api returns 500'), agentId: 'agent' })
    expect(prompt.mock.calls[0][0]).toMatchObject({ command: true, text: '/review the button' })
    expect(prompt.mock.calls[1][0]).toMatchObject({ command: false, text: expect.stringContaining('User comment:\n/api returns 500') })
  })

  it('reports explicit capacity with its request before dispatch, keeping the conversation', async () => {
    const comment = commentFixture({ status: 'replied', thread: commentMessages(64, 'Completed', 'agent') })
    const { fixture, prompt, store } = await aiThreadsChannelFixture({ before: root => writeCommentsFile(root, '.histoire/threads.json', [comment]) })
    await fixture.request('histoire:ui:ai-thread-create', { draft: { ...commentDraft(comment.body), id: comment.id }, agentId: 'agent', requestId: REQUEST_ID })
    expect(prompt).not.toHaveBeenCalled()
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:ai-threads-snapshot', expect.objectContaining({ error: 'Comment reply capacity reached. Start a new thread to continue; existing history is preserved.', requestId: REQUEST_ID }))
    expect((await store.list())[0].thread).toHaveLength(64)
  })

  it('reopens archived threads on reply and sends unsent ones to the chosen agent', async () => {
    const resolved = commentFixture({ status: 'resolved', agentId: 'first', thread: [{ author: 'agent', agentId: 'first', body: 'Done', at: '2026-10-03T10:00:00.000Z' }] })
    const unsent = commentFixture()
    const { fixture, prompt, store } = await aiThreadsChannelFixture({ before: root => writeCommentsFile(root, '.histoire/threads.json', [resolved, unsent]) })
    await fixture.request('histoire:ui:ai-thread-reply', { id: resolved.id, body: 'One more', agentId: 'ignored' })
    await fixture.request('histoire:ui:ai-thread-reply', { id: unsent.id, body: 'Please', agentId: 'second' })
    expect(prompt.mock.calls.map(([request]) => [request.threadId, request.agentId])).toEqual([[resolved.id, 'first'], [unsent.id, 'second']])
    expect((await store.list()).map(thread => [thread.id, thread.status, thread.agentId])).toEqual([[resolved.id, 'replied', 'first'], [unsent.id, 'replied', 'second']])
  })
})
