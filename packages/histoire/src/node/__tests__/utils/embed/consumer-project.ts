import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MCP_REPOSITORY_ROOT } from '../mcp/cli-project.js'
import { runPackageCommand } from '../package-consumer.js'

/** Copy real examples without workspace manifests, resolution links or prior build output. */
export async function prepareConsumerExamples(root: string) {
  for (const name of ['embed-vanilla', 'embed-vue', 'embed-node']) {
    const destination = join(root, name)
    await cp(join(MCP_REPOSITORY_ROOT, 'examples', name), destination, {
      recursive: true,
      filter: path => !/(?:^|\/)(?:node_modules|dist|package\.json)(?:\/|$)/.test(path),
    })
  }
  await writeFile(join(root, 'bundle-examples.mjs'), `
import {writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {build} from 'vite';
for(const name of ['embed-vanilla','embed-vue']){
  const root=resolve(name);const modules={};
  await build({root,base:name==='embed-vue'?'/native/':'/vanilla/',configFile:resolve(root,'vite.config.ts'),plugins:[{name:'consumer-module-audit',generateBundle(_options,bundle){
    for(const [file,chunk] of Object.entries(bundle))if(chunk.type==='chunk')modules[file]={entry:chunk.isEntry,modules:Object.keys(chunk.modules),imports:chunk.imports,dynamicImports:chunk.dynamicImports};
  }}]});
  writeFileSync(resolve(root,'graph.json'),JSON.stringify(modules));
}
`)
  for (const name of ['embed-vanilla', 'embed-vue', 'embed-node']) await runPackageCommand('pnpm', ['exec', 'tsc', '--project', `${name}/tsconfig.json`], root)
  await runPackageCommand(process.execPath, ['bundle-examples.mjs'], root)
}

/** Existing real story exercises installed shared globals without optional test-runner peers. */
export async function prepareConsumerBook(root: string, allowedOrigins: readonly string[]) {
  const book = join(root, 'book')
  await mkdir(book)
  await cp(join(MCP_REPOSITORY_ROOT, 'packages/histoire/src/node/__tests__/fixtures/mcp-preview/vue/Deterministic.story.vue'), join(book, 'Deterministic.story.vue'))
  await writeFile(join(book, 'Deterministic.story.md'), '# Deterministic documentation\n\nPacked runtime and deployed assets.\n')
  await writeFile(join(book, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue';export default {base:'/book/',plugins:[vue()],css:{postcss:{plugins:[]}},server:{host:'127.0.0.1',open:false}}`)
  await writeFile(join(book, 'histoire.config.ts'), `import {HstVue} from '@histoire/plugin-vue';export default {plugins:[HstVue()],storyMatch:['*.story.vue'],collectMaxThreads:1,mcp:false,preview:{globals:{theme:'packed'}},embed:{enabled:true,allowedOrigins:${JSON.stringify(allowedOrigins)}}}`)
  return book
}

/** Compile every public browser/native/Node contract from installed declarations. */
export async function compileConsumerTypes(root: string) {
  await writeFile(join(root, 'public-types.ts'), `
import {createHistoireSession,type HistoireSession,type HistoireSurface} from '@histoire/sdk';
import {HistoireProvider,HistoireExplorer,HistoirePreview,HistoireVariantGrid,HistoireStoryTree,HistoireSearch,HistoireToolbar,HistoireControls,HistoireDocs,HistoireSource,HistoireEvents,HistoireTests,useHistoireSession,useHistoireSnapshot} from '@histoire/vue';
import {HstText} from '@histoire/controls/vue';import {createApp,h,type Component} from 'vue';import {createServer} from 'node:http';import {createHistoireProject} from 'histoire/node';
import {useHostChannel} from 'histoire/client';
const session:HistoireSession=createHistoireSession({url:'https://book.example/book/'});
const snapshot=session.getSnapshot();
const color:'light'|'dark'|'auto'=snapshot.settings.colorScheme;
// @ts-expect-error settings snapshots are immutable; updates use settings.update
snapshot.settings.colorScheme='dark';
// @ts-expect-error runtime identity belongs to the session
snapshot.runtime.runtimeId='replacement';
// @ts-expect-error collected metadata is immutable
snapshot.catalog.stories[0].title='Changed';
// @ts-expect-error retained event accounting belongs to the session
snapshot.events.droppedCount=1;
session.subscribe(value=>{
  // @ts-expect-error subscriber projections retain nested immutability
  value.settings.globals.theme='dark';
});
const observed=useHistoireSnapshot().value;
// @ts-expect-error native snapshot observers preserve session immutability
observed.settings.colorScheme='dark';
const surfaces:HistoireSurface[]=['explorer','preview','grid','tree','search','toolbar','controls','docs','source','events','tests'];
session.selection.select({storyId:'story'});session.settings.update({colorScheme:'dark',textDirection:'rtl'});
session.tests.run({mode:'preview',signal:new AbortController().signal});session.source.get({storyId:'story',mode:'raw'});
const channel=session.channels.open('factory');channel.post('pick',{value:null});channel.subscribe(message=>{const runtimeId:string=message.runtimeId;const variantId:string|null=message.target.variantId;void runtimeId;void variantId});channel.getDroppedCount();
const storyChannel=useHostChannel('factory');storyChannel.post('pick',{nested:[null,true,3]});storyChannel.on('pick',(data,message)=>{void data;void message.target});
// @ts-expect-error application channels never accept runtime callbacks
channel.post('pick',()=>{});
const components:Component[]=[HistoireExplorer,HistoirePreview,HistoireVariantGrid,HistoireStoryTree,HistoireSearch,HistoireToolbar,HistoireControls,HistoireDocs,HistoireSource,HistoireEvents,HistoireTests,HstText];
createApp({setup(){useHistoireSession();useHistoireSnapshot();return()=>h(HistoireProvider,{session},()=>components.map(component=>h(component)))}});
async function node(){
  const project=await createHistoireProject({root:process.cwd()});
  const current=project.getSnapshot();
  const status:'idle'|'starting'|'ready'|'restarting'|'failed'|'closed'=current.status;
  // @ts-expect-error project snapshots expose observations, never writable lifecycle
  current.status='failed';
  // @ts-expect-error nested hosting snapshots remain immutable
  current.dev!.status='closed';
  // @ts-expect-error nested collected metadata remains immutable
  current.dev!.catalog!.stories[0].title='Changed';
  project.subscribe(value=>{
    // @ts-expect-error subscriber observations retain immutability
    value.preview!.url='https://other.example/';
  });
  const server=createServer();const middleware=await project.createMiddleware({httpServer:server,base:'/stories/',publicOrigin:'http://localhost:6007'});middleware.middleware;await project.build();await project.close();void status;
}
void node;void surfaces;void color;
`)
  for (const resolution of ['Bundler', 'NodeNext']) {
    const configuration = `tsconfig.public-${resolution}.json`
    await writeFile(join(root, configuration), JSON.stringify({ compilerOptions: { target: 'ES2022', module: resolution === 'Bundler' ? 'ESNext' : 'NodeNext', moduleResolution: resolution, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['node'], strict: true, noEmit: true, skipLibCheck: true }, include: ['public-types.ts'] }))
    await runPackageCommand('pnpm', ['exec', 'tsc', '--project', configuration], root)
  }
  await compileControlsPeerTypes(root)
}

/** Native controls must retain their types under both browser and ESM Node resolution. */
export async function compileControlsPeerTypes(root: string) {
  await writeFile(join(root, 'controls-peer-types.mts'), `
import {provideHistoireControls,useHistoireControls,type HistoireControlsContext,type HstControlOption} from '@histoire/controls/vue';
import {ref} from 'vue';
const option:HstControlOption={label:'Example',value:1};
const context:HistoireControlsContext={overlay:ref<HTMLElement|null>(null),dark:ref(false)};
provideHistoireControls(context);
const current:HistoireControlsContext|undefined=useHistoireControls();
// @ts-expect-error missing ESM resolution must not turn exported context into any
const invalidContext:HistoireControlsContext=1;
// @ts-expect-error provider accepts scoped context, never a numeric value
provideHistoireControls(1);
// @ts-expect-error public option labels retain their string type
const invalidOption:HstControlOption={label:1,value:1};
void option;void current;void invalidContext;void invalidOption;
`)
  for (const resolution of ['Bundler', 'NodeNext']) {
    const configuration = `tsconfig.controls-${resolution}.json`
    await writeFile(join(root, configuration), JSON.stringify({ compilerOptions: { target: 'ES2023', module: resolution === 'Bundler' ? 'ESNext' : 'NodeNext', moduleResolution: resolution, lib: ['ES2023', 'DOM'], types: [], strict: true, noEmit: true, skipLibCheck: true }, include: ['controls-peer-types.mts'] }))
    await runPackageCommand('pnpm', ['exec', 'tsc', '--project', configuration], root)
  }
}

/** Module provenance comes from executed Vite build, not package manifest assumptions. */
export async function readConsumerGraph(root: string, example: 'embed-vanilla' | 'embed-vue') {
  return JSON.parse(await readFile(join(root, example, 'graph.json'), 'utf8')) as Record<string, { entry: boolean, modules: string[], imports: string[], dynamicImports: string[] }>
}
