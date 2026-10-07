import { onTestFinished } from 'vitest'
import { createCanvasStartupCoordinator } from '../../../../histoire-app/src/app/components/canvas/frame-startup-coordinator.js'

/** Create a startup coordinator and dispose it when the owning test finishes. */
export function canvasStartupCoordinatorFixture(limit = 2) {
  const coordinator = createCanvasStartupCoordinator(limit)
  onTestFinished(() => coordinator.dispose())
  return coordinator
}

/** Record one startup and optionally hold its slot until readiness resolves. */
export function canvasStartupTask(started: string[], name: string, readiness?: Promise<void>) {
  return async () => {
    started.push(name)
    await readiness
  }
}
