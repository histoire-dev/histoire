import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startMcpProcess } from '../mcp/process.js'

/** Source-development alias is selected at process import, so fixture needs fresh process. */
export async function createEmbedSourceDevelopment(root: string, configFile: string) {
  const entry = join(root, 'embed-source-development.mjs')
  await writeFile(entry, `import {createHistoireProject} from 'histoire/node';
const project=await createHistoireProject({root:process.cwd(),configFile:${JSON.stringify(configFile)}});
process.once('SIGTERM',()=>{void project.close().then(()=>process.exit(0))});
const dev=await project.startDev({host:'127.0.0.1',port:0});await dev.ready;
console.log('EMBED_READY '+dev.url);`)
  const child = startMcpProcess([], root, { HISTOIRE_DEV: 'true' }, entry)
  try {
    const url = (await child.waitFor(/EMBED_READY (http[^\r\n]+)/, 60_000))[1]
    return { url, close: () => child.close(), output: () => child.output(), process: child.child }
  }
  catch (error) {
    await child.close()
    throw error
  }
}
