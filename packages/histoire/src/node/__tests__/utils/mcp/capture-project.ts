import { cp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createMcpCliProject, linkMcpFixturePlaywright, MCP_REPOSITORY_ROOT } from './cli-project.js'

/** Real animated/globals book shared by dev and immutable capture proof. */
export async function createMcpCaptureProject() {
  const fixture = await createMcpCliProject()
  await linkMcpFixturePlaywright(fixture.root)
  await writeFile(resolve(fixture.root, 'custom config.ts'), `import {HstVue} from '@histoire/plugin-vue';export default {plugins:[HstVue()],storyMatch:['Deterministic.story.vue'],mcp:true,theme:{defaultColorScheme:'light'},preview:{textDirection:'rtl',globals:{theme:'default'}},build:{target:'node'}}`)
  await writeFile(resolve(fixture.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue';export default {base:'/book/',plugins:[vue()]}`)
  await cp(resolve(MCP_REPOSITORY_ROOT, 'packages/histoire/src/node/__tests__/fixtures/mcp-preview/vue/Deterministic.story.vue'), resolve(fixture.root, 'Deterministic.story.vue'))
  return fixture
}
