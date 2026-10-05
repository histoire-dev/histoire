import type { HistoireCapabilities, HistoireSnapshot, HistoireSourceDescriptor } from '../../../../../../histoire-protocol/src/index.js'
import { createDefaultHistoireSettings } from '../../../../../../histoire-protocol/src/index.js'

/** Complete portable descriptor shared by malformed DTO and snapshot scenarios. */
export function createEmbedDescriptor(): HistoireSourceDescriptor {
  const entry = () => ({ available: true })
  const capabilities: HistoireCapabilities = {
    catalog: entry(),
    search: entry(),
    docs: entry(),
    rawSource: entry(),
    dynamicSource: entry(),
    state: entry(),
    customControls: entry(),
    previewTests: entry(),
    serverTests: entry(),
    openInEditor: entry(),
    hostChannels: entry(),
    surfaces: { explorer: entry(), preview: entry(), grid: entry(), tree: entry(), search: entry(), toolbar: entry(), controls: entry(), docs: entry(), source: entry(), events: entry(), tests: entry() },
  }
  return {
    descriptorVersion: 1,
    protocolVersion: 1,
    sourceId: 'book',
    epoch: 'epoch',
    revision: 'revision',
    mode: 'dev',
    capabilities,
    catalog: { stories: [{ id: 'a:b', title: 'First', path: [], docsOnly: false, variants: [{ id: 'c', title: 'One' }, { id: 'other', title: 'Two' }], content: { docs: true, rawSource: true } }, { id: 'a', title: 'Second', path: [], docsOnly: false, variants: [{ id: 'b:c', title: 'One' }], content: { docs: true, rawSource: true } }, { id: 'docs', title: 'Docs', path: [], docsOnly: true, variants: [], content: { docs: true, rawSource: false } }], tree: [{ kind: 'story', title: 'Story', storyId: 'a:b' }], diagnostics: [] },
  }
}

/** Full snapshot shares descriptor metadata and existing default settings. */
export function createEmbedSnapshot(): HistoireSnapshot {
  const descriptor = createEmbedDescriptor()
  return {
    status: 'ready',
    stale: false,
    source: { sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision, mode: descriptor.mode, url: 'https://book.test/' },
    catalog: descriptor.catalog,
    diagnostics: descriptor.catalog.diagnostics,
    selection: null,
    runtime: { status: 'absent', mountId: null, runtimeId: null, layout: null, viewports: [], viewport: null },
    state: null,
    settings: createDefaultHistoireSettings(),
    capabilities: descriptor.capabilities,
    events: { items: [], droppedCount: 0 },
  }
}
