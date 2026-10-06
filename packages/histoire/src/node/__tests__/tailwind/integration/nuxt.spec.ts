import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { globby } from 'globby'
import { createHistoireProject } from 'histoire/node'
import { expect, it } from 'vitest'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'

it('generates v4 tokens from actual Nuxt UI project and its configured CSS theme', async () => {
  const fixture = await createMcpFrameworkProject('nuxt-ui')
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  try {
    const config = join(fixture.root, 'nuxt.config.ts')
    await writeFile(config, (await readFile(config, 'utf8')).replace('ui: { fonts:', 'ui: { theme: { colors: [\'primary\', \'custom\'] }, fonts:'))
    await writeFile(join(fixture.root, 'tokens.config.ts'), `import config from './histoire.config'; export default {...config,storyMatch:[],mcp:false,collectMaxThreads:1}`)
    project = await createHistoireProject({ root: fixture.root, configFile: 'tokens.config.ts' })
    const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
    await dev.ready
    const stories = project.getSnapshot().dev!.catalog!.stories
    const generated = stories.filter(story => story.id.startsWith('tailwind'))
    expect(generated).toHaveLength(1)
    expect(generated[0].id).not.toBe('tailwind')
    expect(generated[0].variants.some(variant => variant.id === 'background-color')).toBe(true)
    const files = await globby('.histoire/tmp/dev/**/Tailwind.story.js', { cwd: fixture.root, absolute: true })
    expect(files).toHaveLength(1)
    const source = await readFile(files[0], 'utf8')
    expect(source).toContain('"relativePath":"app/assets/css/main.css"')
    expect(source).toContain('"name":"bg-custom-500"')
    expect(source).toContain('--ui-color-custom-500')
    expect(source).not.toContain('tailwind.config.js')
  }
  finally {
    await project?.close()
    await fixture.close()
  }
}, 120_000)
