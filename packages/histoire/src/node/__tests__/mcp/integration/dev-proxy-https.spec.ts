import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createEmbedVueProject } from '../../utils/embed/vue-project.js'
import { closeMcpFixtures, startMcpProcess } from '../../utils/mcp/process.js'

it.each([
  { ssl: false, warnings: 0 },
  { ssl: true, warnings: 1 },
])('serves the story catalog over HTTP with basic-ssl=$ssl', async ({ ssl, warnings }) => {
  const title = 'HTTPS fallback story'
  const fixture = await createEmbedVueProject(title)
  const cleanup: (() => Promise<unknown>)[] = [fixture.close]
  try {
    // Resolve the suite's installed plugin from the isolated consumer project.
    const sslImport = ssl ? `import basicSsl from ${JSON.stringify(import.meta.resolve('@vitejs/plugin-basic-ssl'))};` : ''
    await Promise.all([
      fixture.setTitle(title),
      writeFile(join(fixture.root, 'vite.config.ts'), `
        import vue from '@vitejs/plugin-vue';
        ${sslImport}
        export default { base: '/book/', plugins: [vue()${ssl ? ', basicSsl()' : ''}] };
      `),
    ])

    const dev = startMcpProcess(['dev', '--host', '127.0.0.1', '--port', '0', '--config', 'custom.ts', '--no-mcp', '--no-tui'], fixture.root)
    cleanup.push(dev.close)
    // The CLI prints Local after the parent has installed the backend target.
    const [, address] = await dev.waitFor(/Local:\s+(\S+)/)
    const url = new URL(address)
    expect(url.protocol).toBe('http:')

    const catalog = await fetch(new URL('./__resolved__virtual:$histoire-stories', url), { signal: AbortSignal.timeout(10_000) })
    const body = await catalog.text()
    expect(catalog.status, body.slice(0, 200)).toBe(200)
    expect(body).toContain(title)
    expect(dev.output().match(/server\.https is not supported by `histoire dev`/g) ?? []).toHaveLength(warnings)
  }
  finally {
    await closeMcpFixtures(cleanup)
  }
})
