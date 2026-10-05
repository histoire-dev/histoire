import type { HistoireProject } from 'histoire/node'
import { writeFile } from 'node:fs/promises'
import { cpus, release, totalmem } from 'node:os'
import { gzipSync } from 'node:zlib'

/** Public API latency samples, in milliseconds, without injected transports. */
export interface EmbedPerformanceSamples {
  /** Captured book identity after warm-up. */
  source: unknown
  /** Visible side-by-side preview layout avoids offscreen animation throttling. */
  viewport: { width: number, height: number }
  /** Connection plus completed catalog. */
  connect: number[]
  /** Primary mount to actual runtime ready. */
  preview: number[]
  /** Same-story variant selection to runtime ready. */
  selection: number[]
  /** Canonical state patch acknowledgement. */
  state: number[]
  /** Three sessions connecting and mounting independent primary previews. */
  concurrent: number[]
}

/** One warm-up is discarded; each sample still creates fresh public sessions. */
export async function measureEmbedPerformance(page: any, options: {
  /** Explicit allowed cross-origin book base. */
  bookUrl: string
  /** Structured target from completed catalog, never parsed IDs. */
  storyId: string
  /** Two actual variant IDs for same-story switching. */
  variantIds: [string, string]
  /** Warm sample count, normally 20. */
  samples: number
}): Promise<EmbedPerformanceSamples> {
  await page.setViewportSize({ width: 2160, height: 700 })
  // String module import avoids Vitest's SSR dynamic-import instrumentation.
  return page.evaluate(`(async()=>{
    const options=${JSON.stringify(options)};
    const {createHistoireSession}=await import('/sdk.js');
    document.querySelector('#mount')?.remove();
    document.body.style.cssText='margin:0;display:flex';
    const record={source:null,viewport:{width:innerWidth,height:innerHeight},connect:[],preview:[],selection:[],state:[],concurrent:[]};
    function container(){const element=document.createElement('div');element.style.cssText='width:720px;height:560px;flex-shrink:0';document.body.append(element);return element;}
    async function elapsed(operation){const start=performance.now();await operation();return performance.now()-start;}
    for(let index=0;index<=options.samples;index++){
      const session=createHistoireSession({url:options.bookUrl});
      const host=container();
      const owned=[session];
      const hosts=[host];
      try{
        const connect=await elapsed(async()=>{await session.connect();await session.catalog.list();});
        record.source=session.getSnapshot().source;
        await session.selection.select({storyId:options.storyId,variantId:options.variantIds[0]});
        const preview=await elapsed(()=>session.mount(host,{surface:'preview'}).ready);
        const selection=await elapsed(()=>session.selection.select({storyId:options.storyId,variantId:options.variantIds[1]}));
        const state=await elapsed(()=>session.state.patch({count:index}));
        await session.dispose();host.remove();
        const concurrent=await elapsed(()=>Promise.all(Array.from({length:3},async()=>{
          const next=createHistoireSession({url:options.bookUrl});const element=container();owned.push(next);hosts.push(element);
          await next.connect();await next.selection.select({storyId:options.storyId,variantId:options.variantIds[0]});
          await next.mount(element,{surface:'preview'}).ready;
        })));
        if(index){for(const [name,value] of Object.entries({connect,preview,selection,state,concurrent}))record[name].push(value);}
      }finally{await Promise.all(owned.map(session=>session.dispose()));for(const element of hosts)element.remove();}
    }
    return record;
  })()`)
}

/** Nearest-rank p95 retains raw samples for repeatable release comparisons. */
export function performancePercentile(samples: readonly number[]): number {
  if (!samples.length || samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Finite performance samples required')
  return [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1]
}

/** Measure existing capture API, whose lifecycle owns fresh browser each call. */
export async function measureCapturePerformance(project: HistoireProject, target: { storyId: string, variantId: string }, samples: number): Promise<number[]> {
  const values: number[] = []
  for (let index = 0; index <= samples; index++) {
    const start = performance.now()
    await project.captureScreenshot(target)
    if (index) values.push(performance.now() - start)
  }
  return values
}

/** Persist raw timings and explicit measurement conditions for release audit. */
export async function recordEmbedPerformance(options: {
  /** Complete public browser operation measurements. */
  browser: EmbedPerformanceSamples
  /** Public Node capture measurements, including lifecycle overhead. */
  capture: number[]
  /** Exact served descriptor bytes, not an unrelated catalog projection. */
  descriptor: Uint8Array
  /** Actual launched browser version. */
  browserVersion: string
  /** Actual physical book size and fixture identity. */
  fixture: { name: string, stories: number, variants: number }
  /** Expected warm sample count. */
  sampleCount: number
  /** Explicit owned evidence path. */
  outputPath: string
}) {
  const { source, viewport, ...browserSamples } = options.browser
  const samples = { ...browserSamples, capture: options.capture }
  if (Object.values(samples).some(values => values.length !== options.sampleCount)) throw new Error('Performance record has incomplete samples')
  const report = {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      operatingSystem: release(),
      cpuModel: cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      browser: { name: process.env.HISTOIRE_EMBED_BROWSER ?? 'chromium', version: options.browserVersion },
      viewport,
      httpCache: 'max-age=3600; one warm-up discarded',
      capture: 'fresh browser/context per public call; warm host/process only',
    },
    source,
    ...options.fixture,
    sampleCount: options.sampleCount,
    descriptorGzipBytes: gzipSync(options.descriptor).byteLength,
    p95Milliseconds: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, performancePercentile(values)])),
    samples,
  }
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`SDK performance p95 milliseconds: ${JSON.stringify(report.p95Milliseconds)}; descriptor gzip bytes: ${report.descriptorGzipBytes}\n`)
  return report
}
