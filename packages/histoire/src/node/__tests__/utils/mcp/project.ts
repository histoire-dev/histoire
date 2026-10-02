import type { ServerStoryFile } from '@histoire/shared'
import type { Context } from '../../../context.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Exact reusable identities for a deterministic catalog fixture. */
export const MCP_PROJECT_OPTIONS = { projectId: 'histoire-project', epoch: '00000000-0000-4000-8000-000000000001' }

/** Creates only fields consumed by catalog/source code, without a Vite runtime. */
export function createMcpContext(root: string, storyFiles: ServerStoryFile[] = []): Context {
  return { root, mode: 'dev', storyFiles, markdownFiles: [], supportPlugins: [], config: {} as any, resolvedViteConfig: {} as any }
}

/** Collected virtual story usable by catalog, content, and deployment tests. */
export function createMcpStory(root: string, id = 'story-a', relativePath = 'a.story.js', variants = [{ id: 'default', title: 'Default' }]): ServerStoryFile {
  return { id, path: join(root, relativePath), moduleId: join(root, relativePath), relativePath, fileName: 'a', supportPluginId: 'vue', virtual: true, moduleCode: 'export default {}', treePath: ['Folder', 'A'], story: { id, title: 'A', variants } }
}

/** Owns and disposes a temporary registered project root. */
export async function createMcpProjectFixture() {
  const root = await mkdtemp(join(tmpdir(), 'histoire-mcp-project-'))
  return {
    root,
    /** Writes one physical story while retaining collected metadata. */
    async physical(text: string, relativePath = 'a.story.js') {
      const file = createMcpStory(root, 'story-a', relativePath)
      file.virtual = false
      await writeFile(file.path, text)
      return file
    },
    /** Removes only this fixture's directory. */
    async close() { await rm(root, { recursive: true, force: true }) },
  }
}
