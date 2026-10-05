/** Real browser handshake probe, independent of SDK's correct outbound framing. */
export async function probeEmbedHandshake(page: any, input: {
  bookUrl: string
  hintMismatch?: boolean
  ports?: number
  range?: {
    min: number
    max: number
  }
  surface?: string
  wrongSource?: boolean
}) {
  return page.evaluate(async (input) => {
    const parentOrigin = location.origin
    const sessionId = 'probe-session'
    const mountId = 'probe-mount'
    const iframe = document.createElement('iframe')
    iframe.id = 'bridge-probe'
    const url = new URL('__embed.html', input.bookUrl)
    for (const [key, value] of Object.entries({ view: input.surface ? 'surface' : 'bridge', ...(input.surface ? { surface: input.surface } : {}), parentOrigin, sessionId, mountId })) {
      url.searchParams.set(key, value)
    }
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve()
      iframe.src = url.href
      document.body.append(iframe)
    })
    const channels = Array.from({ length: Math.max(1, input.ports ?? 1) }, () => new MessageChannel())
    const sibling = input.wrongSource ? document.createElement('iframe') : undefined
    if (sibling) {
      await new Promise<void>((resolve) => {
        sibling.onload = () => resolve()
        sibling.srcdoc = '<script>addEventListener("message",event=>parent.document.querySelector("#bridge-probe").contentWindow.postMessage(event.data.hello,event.data.origin,event.ports))</script>'
        document.body.append(sibling)
      })
    }
    try {
      const ack = new Promise<any>((resolve) => {
        const timer = setTimeout(() => resolve({ silent: true }), 500)
        channels[0].port1.onmessage = (event) => {
          clearTimeout(timer)
          resolve(event.data)
        }
      })
      const role = !input.surface ? 'data' : ['explorer', 'preview', 'grid'].includes(input.surface) ? 'primary' : input.surface === 'controls' ? 'controls' : 'view'
      const hello = { kind: 'histoire:hello', protocolRange: input.range ?? { min: 1, max: 1 }, nonce: 'probe-nonce', sessionId: input.hintMismatch ? 'forged-session' : sessionId, mountId, parentOrigin, role }
      const transferred = channels.slice(0, input.ports ?? 1).map(channel => channel.port2)
      if (sibling) {
        sibling.contentWindow!.postMessage({ hello, origin: url.origin }, parentOrigin, transferred)
      }
      else {
        iframe.contentWindow!.postMessage(hello, url.origin, transferred)
      }
      return await ack
    }
    finally {
      iframe.remove()
      sibling?.remove()
      for (const channel of channels) {
        channel.port1.close()
        channel.port2.close()
      }
    }
  }, input)
}
