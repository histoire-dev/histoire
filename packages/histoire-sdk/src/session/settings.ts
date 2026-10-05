import type { HistoireSettingsPatch } from '@histoire/protocol'
import type { SessionContext } from './context.js'
import { validateSettingsPatch } from '@histoire/protocol'
import { request } from './request.js'

/** Apply latest preferences once runtime is ready; never restore old mirror. */
export function sendCurrentSettings(context: SessionContext): Promise<void> {
  const primary = context.primaryId ? context.mounts.get(context.primaryId) : undefined
  const runtimeId = context.snapshot.runtime.runtimeId
  if (context.snapshot.status !== 'ready' || !primary?.active || context.snapshot.runtime.status !== 'ready' || !runtimeId) return Promise.resolve()
  const settings = context.snapshot.settings
  const previous = context.settingsSync
  if (previous?.mountId === primary.handle.id && previous.runtimeId === runtimeId && previous.settings === settings) return previous.promise
  const promise = request<void>(context, primary.transport, 'settings.update', settings, { kind: 'runtime', mountId: primary.handle.id })
  const sync = { mountId: primary.handle.id, runtimeId, settings, promise }
  context.settingsSync = sync
  void promise.catch(() => {
    if (context.settingsSync === sync) context.settingsSync = null
  })
  return promise
}

/** Validate/store preferences even without primary; isolated from host document. */
export async function updateSettings(context: SessionContext, patch: HistoireSettingsPatch): Promise<void> {
  context.assertActive()
  const validated = validateSettingsPatch(patch)
  context.explicitSettings = context.copy({ ...context.explicitSettings, ...validated })
  const settings = context.copy({ ...context.snapshot.settings, ...validated })
  context.publish({ settings })
  context.persistence.write(settings)
  await sendCurrentSettings(context)
}
