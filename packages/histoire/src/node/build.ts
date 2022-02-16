import { join } from 'pathe'
import { build as viteBuild, createServer as createViteServer } from 'vite'
import fs from 'fs-extra'
import { APP_PATH } from './alias.js'
import { Context } from './context.js'
import { createVitePlugins } from './plugin.js'
import { findAllStories } from './stories.js'
import type { RollupOutput } from 'rollup'
import { useCollectStories } from './collect.js'

export async function build (ctx: Context) {
  await findAllStories(ctx)

  // Collect story data
  const server = await createViteServer({
    root: ctx.config.sourceDir,
    plugins: [
      (await import('@vitejs/plugin-vue')).default(), // @TODO check if already present in vite config
    ],
  })
  await server.pluginContainer.buildStart({})
  const { executeStoryFile, destroy: destroyCollectStories } = useCollectStories({
    server,
    throws: true,
  }, ctx)
  for (const storyFile of ctx.storyFiles) {
    await executeStoryFile(storyFile)
  }
  await server.close()
  await destroyCollectStories()

  const results = await viteBuild({
    root: ctx.config.sourceDir,
    plugins: await createVitePlugins(ctx),
    build: {
      rollupOptions: {
        input: [
          join(APP_PATH, 'index.ts'),
          join(APP_PATH, 'sandbox.ts'),
        ],
      },
      outDir: ctx.config.outDir,
      emptyOutDir: true,
      cssCodeSplit: false,
    },
  })
  const result = Array.isArray(results) ? results[0] : results as RollupOutput

  const styleOutput = result.output.find(o => o.name === 'style.css' && o.type === 'asset')

  // Index
  const indexOutput = result.output.find(o => o.name === 'index' && o.type === 'chunk')
  await writeHtml(indexOutput.fileName, styleOutput.fileName, 'index.html', ctx)

  // Sandbox
  const sandboxOutput = result.output.find(o => o.name === 'sandbox' && o.type === 'chunk')
  await writeHtml(sandboxOutput.fileName, styleOutput.fileName, '__sandbox.html', ctx)
}

async function writeHtml (jsEntryFile: string, cssEntryFile: string, htmlFileName: string, ctx: Context) {
  const code = `<!DOCTYPE html>
<html>
<head>
  <title></title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
  <link rel="stylesheet" href="/${cssEntryFile}">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/${jsEntryFile}"></script>
</body>
</html>`
  await fs.writeFile(join(ctx.config.outDir, htmlFileName), code, 'utf8')
}
