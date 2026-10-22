import type { Context } from '../../context.js'
import type { AiThreadsAgentBridge } from '../../server/ui-channel/ai-threads.js'
import { onTestFinished, vi } from 'vitest'
import { registerAiThreadsChannel } from '../../server/ui-channel/ai-threads.js'
import { commentStory } from './comments.js'
import { configTestProject } from './config-codemod.js'
import { uiChannelFixture } from './ui-channel.js'

/** Options of {@link aiThreadsChannelFixture}. */
export interface AiThreadsChannelFixtureOptions {
  /** Extra bridge members, such as `commandNames`. */
  bridge?: Partial<AiThreadsAgentBridge>
  /** Extra project config merged over the story conventions. */
  config?: Record<string, unknown>
  /** Runs in the project before the channel starts (seed files). */
  before?: (root: string) => Promise<void>
}

/**
 * AI threads channel over a fresh project (removed by `disposeConfigProjects`) with the
 * collected button story and a stub agent replying `Done`; the channel closes after the test.
 * @param options Bridge, config and seed overrides.
 */
export async function aiThreadsChannelFixture(options: AiThreadsChannelFixtureOptions = {}) {
  const { root } = await configTestProject()
  await options.before?.(root)
  const fixture = uiChannelFixture()
  const prompt = vi.fn<AiThreadsAgentBridge['prompt']>(async () => ({ text: 'Done' }))
  const ctx = { mode: 'dev', root, config: { storyMatch: ['**/*.story.vue'], plugins: [{ name: '@histoire/plugin-vue' }], agents: { presets: [] }, ...options.config }, storyFiles: [{ relativePath: 'src/Button.story.vue', story: commentStory }] } as unknown as Context
  const store = registerAiThreadsChannel(ctx, fixture.channel, { prompt, cancel: vi.fn(), ...options.bridge })
  onTestFinished(() => fixture.channel.close())
  /** Snapshot errors published to the test client, in order. */
  const errors = () => fixture.client.send.mock.calls.map(([, snapshot]) => snapshot.error).filter(Boolean)
  return { root, ctx, fixture, prompt, store, errors }
}
