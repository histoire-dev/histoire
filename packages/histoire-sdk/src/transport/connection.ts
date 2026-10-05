import type { HistoireConnectContext, HistoireSourceConnection } from '../adapters/types.js'
import { HistoireSdkError } from '@histoire/protocol'
import { createBridgeFrame } from './handshake.js'
import { createBridgePort } from './port.js'
/** Explicit browser-only metadata connection; bridge imports no story modules. */
export async function connectRemoteSource(context: HistoireConnectContext): Promise<HistoireSourceConnection> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new HistoireSdkError('BROWSER_REQUIRED', 'Remote connection requires browser')
  }
  if (!document.body) {
    throw new HistoireSdkError('BROWSER_REQUIRED', 'Remote connection requires document body')
  }
  let bridge: ReturnType<typeof createBridgePort> | undefined
  const frame = createBridgeFrame({ ...context, mountId: `${context.sessionId}:bridge`, role: 'data', container: document.body, disconnected: () => bridge?.disconnect() })
  try {
    const { port, ack } = await frame.ready
    bridge = createBridgePort({ port, owner: ack.owner, role: 'data', descriptor: ack.descriptor })
    let descriptor = ack.descriptor
    bridge.subscribe((event) => {
      if (event.type === 'catalog') {
        descriptor = event.descriptor
      }
      else if (event.type === 'disconnect') {
        frame.close()
      }
    })
    return { ...bridge, get descriptor() {
      return descriptor
    }, initialSettings: { colorScheme: descriptor.config?.theme.defaultColorScheme ?? 'auto', globals: descriptor.config?.globals ?? {}, textDirection: descriptor.config?.textDirection ?? 'ltr' }, close() {
      bridge?.close()
      frame.close()
    } }
  }
  catch (error) {
    frame.close()
    throw error
  }
}
