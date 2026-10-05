import { cp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import connect from 'connect'
import sirv from 'sirv'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { closeMcpFixtures, startMcpProcess } from '../mcp/process.js'
import { createMcpProjectFixture } from '../mcp/project.js'
import { runPackageCommand } from '../package-consumer.js'

/** Only compiled example outputs are served; same consumer origin hosts both examples. */
export async function createConsumerExampleHost(root: string) {
  const application = connect()
    .use('/vanilla/', sirv(join(root, 'embed-vanilla/dist'), { dev: true }))
    .use('/native/', sirv(join(root, 'embed-vue/dist'), { dev: true }))
  const server = createServer(application)
  try {
    const origin = await listenOwnedServer(server, 0, '127.0.0.1')
    return { origin, close: () => closeOwnedServer(server) }
  }
  catch (error) {
    await closeOwnedServer(server)
    throw error
  }
}

/** Launch real copied application from unrelated cwd; library never owns caller HTTP/WS. */
export async function startConsumerNodeExample(root: string, book: string) {
  const reservation = createServer()
  const origin = await listenOwnedServer(reservation, 0, '127.0.0.1')
  await closeOwnedServer(reservation)
  const process = startMcpProcess([book], tmpdir(), { PORT: new URL(origin).port, PUBLIC_ORIGIN: origin }, join(root, 'embed-node/dist/index.js'))
  try {
    const ready = await process.waitFor(/Histoire: (http\S+)/, 120_000)
    return { ...process, origin, bookUrl: ready[1] }
  }
  catch (error) {
    await process.close()
    throw error
  }
}

/** Public Node build and explicit missing-test-peer path use installed imports only. */
export async function buildConsumerBook(root: string, book: string) {
  const program = `
import {writeFile} from 'node:fs/promises';import {createHistoireProject} from 'histoire/node';
const cwd=process.cwd();const project=await createHistoireProject({root:${JSON.stringify(book)}});
try{
  const built=await project.build({outDir:'../built-book'});let testError;
  try{await project.runTests({storyId:'deterministic',variantId:'normal'})}catch(error){testError=error.code}
  if(process.cwd()!==cwd)throw new Error('Node SDK changed process cwd');
  await writeFile('book-build.json',JSON.stringify({outDir:built.outDir,testError}));
}finally{await project.close()}
`
  await writeFile(join(root, 'build-book.mjs'), program)
  await runPackageCommand(globalThis.process.execPath, ['build-book.mjs'], root)
  const deployed = await createMcpProjectFixture()
  const server = createServer(connect().use('/book/', sirv(deployed.root, { dev: true })))
  try {
    // Copied output has no adjacent project dependencies or workspace resolution.
    await cp(join(root, 'built-book'), deployed.root, { recursive: true })
    const origin = await listenOwnedServer(server, 0, '127.0.0.1')
    return { bookUrl: `${origin}/book/`, close: () => closeMcpFixtures([() => deployed.close(), () => closeOwnedServer(server)]) }
  }
  catch (error) {
    await closeMcpFixtures([() => deployed.close(), () => closeOwnedServer(server)])
    throw error
  }
}
