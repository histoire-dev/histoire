import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

/** Test-only ACP peer implements protocol messages, never edits files. */
const lines = createInterface({ input: process.stdin })
/** Scenario selected by each isolated subprocess test. */
const scenario = process.argv[2] ?? 'normal'
// Delayed termination exposes admission races while the captured adapter retires.
if (scenario === 'delayed-stop') {
  appendFileSync('launches.txt', `${process.pid}\n`)
  process.on('SIGTERM', () => setTimeout(() => process.exit(0), 300))
}
if (scenario === 'rotation-secret') {
  process.on('SIGTERM', () => {
    process.stderr.write(`shutdown ${process.env.AGENT_TOKEN ?? ''}\n`)
    setTimeout(() => process.exit(0), 10)
  })
}
/** Session counter proves comment-thread session reuse. */
let sessions = 0
/** Prompt currently waiting for a permission reply or cancellation. */
let pending

/** Writes one ACP JSON-RPC envelope to the SDK transport. */
function send(value) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`)
}

/** Returns a response correlated to the client's request. */
function result(id, value) {
  send({ id, result: value })
}

/** Emits a protocol-valid reply chunk for the selected session. */
function update(sessionId, text) {
  send({ method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } })
}

lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    result(message.id, { protocolVersion: scenario === 'mismatch' ? 999 : message.params.protocolVersion, agentCapabilities: { mcpCapabilities: { http: true } }, authMethods: [], agentInfo: { name: 'fixture', version: '1.0.0' } })
  }
  else if (message.method === 'session/new') {
    result(message.id, { sessionId: `session-${++sessions}` })
  }
  else if (message.method === 'session/prompt') {
    if (scenario === 'crash') {
      process.stderr.write(`fixture crash ${process.env.AGENT_TOKEN ?? ''}\n`)
      process.exit(2)
    }
    if (scenario === 'permission' || scenario === 'public-secrets') {
      pending = message
      const token = scenario === 'public-secrets' ? process.env.AGENT_TOKEN ?? '' : ''
      send({ id: 'permission', method: 'session/request_permission', params: {
        sessionId: message.params.sessionId,
        toolCall: { toolCallId: 'edit', title: `Edit fixture file ${token}`, kind: 'edit', locations: [{ path: `${process.cwd()}/${token || 'outside'}.ts` }] },
        options: [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'always', name: 'Allow session', kind: 'allow_always' }, { optionId: 'deny', name: 'Deny', kind: 'reject_once' }],
      } })
    }
    else {
      process.stderr.write(`fixture log ${process.env.AGENT_TOKEN ?? ''}\n`)
      if (scenario === 'diff') {
        const content = [{ type: 'diff', path: `${process.cwd()}/src/button.ts`, oldText: 'first\nold\nkeep\nlast\n', newText: 'first\nnew\nkeep\nextra\nlast\n' }]
        send({ method: 'session/update', params: { sessionId: message.params.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 'edit', title: 'Edit button', kind: 'edit', status: 'pending', content } } })
        send({ method: 'session/update', params: { sessionId: message.params.sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: 'edit', status: 'completed', content } } })
        for (const [toolCallId, status, path] of [['pending', 'pending', 'src/pending.ts'], ['failed', 'failed', 'src/failed.ts'], ['outside', 'completed', '../outside.ts']]) {
          send({ method: 'session/update', params: { sessionId: message.params.sessionId, update: { sessionUpdate: 'tool_call', toolCallId, title: toolCallId, kind: 'edit', status, content: [{ type: 'diff', path: `${process.cwd()}/${path}`, oldText: null, newText: 'new\n' }] } } })
        }
      }
      if (scenario === 'split-secret') {
        const token = process.env.AGENT_TOKEN ?? ''
        update(message.params.sessionId, `before ${token.slice(0, 5)}`)
        update(message.params.sessionId, `${token.slice(5)} after`)
      }
      else if (scenario === 'context') {
        update(message.params.sessionId, message.params.prompt[0].text)
      }
      else {
        update(message.params.sessionId, 'Hello ')
        update(message.params.sessionId, `from ${message.params.sessionId} ${process.env.AGENT_TOKEN ?? ''}`)
      }
      result(message.id, { stopReason: 'end_turn' })
    }
  }
  else if (message.id === 'permission' && pending) {
    const token = scenario === 'public-secrets' ? process.env.AGENT_TOKEN ?? '' : ''
    update(pending.params.sessionId, token || (message.result.outcome.outcome === 'selected' ? message.result.outcome.optionId : 'cancelled'))
    result(pending.id, { stopReason: 'end_turn' })
    if (scenario === 'public-secrets') {
      process.stderr.write(`fixture failure ${token}\n`)
      setTimeout(() => process.exit(2), 10)
    }
    pending = undefined
  }
  else if (message.method === 'session/cancel' && pending) {
    result(pending.id, { stopReason: 'cancelled' })
    pending = undefined
  }
})
