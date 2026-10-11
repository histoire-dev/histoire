import type { Ref } from 'vue'
import type { createFrameActions, FrameActionTarget } from '../util/frame-actions.js'
import type { WorkbenchCanvas, WorkbenchProps } from './workbench-types.js'
import { useHistoireResource } from '@histoire/vue/internal'
import { createWorkbenchVisual, provideWorkbenchVisual } from '../stores/visual.js'
import { histoireConfig } from '../util/config.js'
import { snapshotScreenshotTargets } from '../util/screenshot-targets.js'

/** Standalone adapter keeps canvas/menu ownership outside visual comparison store. */
export function useWorkbenchVisualActions(props: WorkbenchProps, canvas: Ref<WorkbenchCanvas | undefined>, actions: ReturnType<typeof createFrameActions>, showTests: () => void, metadataReady: Readonly<Ref<boolean>>) {
  if (!__HISTOIRE_DEV__ || !histoireConfig.visual || histoireConfig.visual.enabled === false) {
    return undefined
  }
  const model = createWorkbenchVisual(props.session)
  provideWorkbenchVisual(model)
  useHistoireResource(model.close)
  /** Menu target is captured synchronously, independent from current selection. */
  function savedTarget(target: FrameActionTarget) {
    const frame = canvas.value?.registry.getFrame(target.frameKey)
    if (!frame || frame.storyId !== target.storyId || frame.variantId !== target.variantId) {
      return undefined
    }
    if (frame.propsOverride && !metadataReady.value) return undefined
    const [snapshot] = snapshotScreenshotTargets([{ storyId: target.storyId, variantId: target.variantId, ...(frame.propsOverride ? { propsOverride: frame.propsOverride } : {}) }])
    return snapshot
  }
  const dispose = actions.registerFrameAction({
    id: 'visual.compare-main',
    label: 'Compare to main',
    icon: 'compare',
    group: 'tests',
    devOnly: true,
    available: target => !!savedTarget(target),
    disabled: () => model.requestId.value ? 'Visual run already active' : undefined,
    async run(target) {
      const captured = savedTarget(target)
      if (!captured) {
        return
      }
      const source = JSON.stringify(props.session.getSnapshot().source)
      let caseId: string | undefined
      if (captured.propsOverride) {
        const saved = await model.save([{ ...captured, label: `${target.storyId} › ${target.variantId} · Matrix` }])
        caseId = saved[0]?.id
      }
      else {
        await model.refresh()
        caseId = model.cases.value.find(item => item.kind === 'canonical' && item.storyId === target.storyId && item.variantId === target.variantId)?.id
      }
      if (!caseId || source !== JSON.stringify(props.session.getSnapshot().source)) {
        return
      }
      showTests()
      model.baselineSource.value = 'main'
      model.profileId.value = ''
      model.start({ caseId, baselineRef: model.baselineRef.value })
    },
  })
  // Keep mockup ordering next to functional Run tests rather than after Save props.
  const compare = actions.entries.get('visual.compare-main')!
  const ordered = [...actions.entries.entries()]
  actions.entries.clear()
  for (const [id, action] of ordered) {
    if (id === compare.id) {
      continue
    }
    actions.entries.set(id, action)
    if (id === 'run-tests') {
      actions.entries.set(compare.id, compare)
    }
  }
  useHistoireResource(dispose)
  return model
}
