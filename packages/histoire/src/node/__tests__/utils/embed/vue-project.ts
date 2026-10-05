import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createMcpProjectFixture } from '../mcp/project.js'
import { linkEmbedFixtureDependencies } from './project.js'

/** Real Vue sources with shared IDs and independently generated plugin output. */
export async function createEmbedVueProject(title: string) {
  const fixture = await createMcpProjectFixture()
  try {
    await linkEmbedFixtureDependencies(fixture.root, 'vue3')
    await writeFile(join(fixture.root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(join(fixture.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { base:'/book/', plugins:[vue()], server:{host:'127.0.0.1',open:false} }`)
    await writeFile(join(fixture.root, 'Book.story.md'), `# ${title} documentation`)
    await writeFile(join(fixture.root, 'custom.ts'), `import { HstVue } from '@histoire/plugin-vue';
export default { theme:{title:${JSON.stringify(title)}}, storyMatch:['*.story.vue'], collectMaxThreads:1, plugins:[HstVue(), {
  name:'owned-output',
  async onDev(api) {
    await api.fs.ensureDir(api.pluginTempDir);
    const file = api.path.join(api.pluginTempDir,'Generated.story.js');
    await api.fs.writeFile(file, 'export default '+JSON.stringify({id:'generated',title:${JSON.stringify(title)},variants:[{id:'main',title:'Main'}]}));
    api.addStoryFile(file);
  }
}] }`)
    return {
      ...fixture,
      /** Edits the same physical source, exercising real project HMR collection. */
      async setTitle(value: string) {
        await writeFile(join(fixture.root, 'Book.story.vue'), `<script setup>const owner=${JSON.stringify(value)}</script><template><Story id="overlap" :title="owner"><Variant id="main"><button>{{owner}}</button></Variant></Story></template>`)
      },
    }
  }
  catch (error) {
    await fixture.close()
    throw error
  }
}
