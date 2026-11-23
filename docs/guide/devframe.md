# Devframe live inspection

Use `@histoire/devframe` to let an authenticated MCP agent inspect a mounted Histoire variant, including its unsaved state and events. The adapter uses its own endpoint. Use the [Histoire MCP server](./mcp.md) for inspection in a fresh isolated runtime.

## Prerequisites and installation

Use Node.js `>=22.12.0`, a running or deployed Histoire source, and a browser host that mounts a variant through the SDK. Your application owns the HTTP or HTTPS server.

Authenticate browsers and MCP agents separately. The host also verifies document ownership before pairing a browser session.

Install the browser SDK and optional adapter in the host project:

```sh
pnpm add @histoire/sdk @histoire/devframe devframe@1.2.2
```

For the Node HTTP routing example below, also install:

```sh
pnpm add @modelcontextprotocol/node@2.1.0
```

Use `@histoire/devframe/client` in the browser. The `/host`, `/node`, and `/report` entries require Node; there is no root package export. Importing an entry starts no listener or connection.

## Enable the source

In the source project's `histoire.config.ts`, enable embedding and inspection. Add the browser host's exact origin to both allowlists:

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
  embed: {
    enabled: true,
    allowedOrigins: ['https://host.example.com'],
  },
  inspection: {
    enabled: true,
    allowedOrigins: ['https://host.example.com'],
  },
})
```

Enabling inspection makes variant and DOM reads available. Enable `inspection.components`, `inspection.accessibility`, or `inspection.diagnostics` for additional reads. Component inspection needs a supported framework provider. To use accessibility reads, make the optional `axe-core` dependency available locally. Check `session.getSnapshot().inspection` for the mounted runtime's capabilities.

For cross-origin framing, also configure the [embedding response headers and host CSP](./embedding.md#origins-and-deployment-headers). The allowlists permit embedding and inspection from the host origin. The next steps authenticate the browser and agent. See [inspection configuration](../reference/config.md#inspection) for the source options.

## Mount the host

Use `mountDevframeHost` on your application's server. The following assumes an existing `server`, application-owned `policy` and `devframeAuth` objects, and a `handleOtherRequests` handler. Install routing before accepting requests.

`devframeAuth` must be a custom Devframe authentication object with `rpcFunctions`, `authorize`, and `onConnect`. Its connection handling verifies browser credentials and binds a stable principal to that transport. The policy methods below must verify identity and document ownership independently; accepting browser-supplied IDs or a transport trust flag alone is insufficient.

```ts
import { mountDevframeHost } from '@histoire/devframe/host'
import { createMcpEndpoint } from '@histoire/devframe/node'
import { toNodeHandler } from '@modelcontextprotocol/node'

const origin = 'https://tools.example.com'
const authorityVersion = 0
const host = await mountDevframeHost({
  server,
  origin,
  base: '/tools/histoire/',
  allowedOrigins: ['https://host.example.com'],
  auth: devframeAuth,
  bridge: {
    identifyPeer: peer => policy.browserPrincipal(peer),
    verifyAttachment: (peer, identity, sourceUrl) =>
      policy.verifyDocument(peer, identity, sourceUrl),
    isCurrent: (peer, identity) => policy.isCurrent(peer, identity),
    allowSource: url => policy.allowsBook(url),
    authorize: request => policy.allowsAgent(request),
    authorityVersion: () => authorityVersion,
  },
})

const endpoint = createMcpEndpoint(
  host.bridge.broker,
  request => policy.agentPrincipal(request),
)
const handleMcp = toNodeHandler(endpoint)

server.on('request', (request, response) => {
  const path = new URL(request.url ?? '/', origin).pathname
  if (path === '/tools/histoire-mcp') {
    // Forward errors to your application's HTTP error handler.
    void handleMcp(request, response).catch((error) => {
      response.destroy(error)
    })
  }
  else if (path.startsWith(host.base)) {
    // Preserve the original URL, including /tools/histoire/.
    host.nodeMiddleware(request, response, () => {
      handleOtherRequests(request, response)
    })
  }
  else {
    handleOtherRequests(request, response)
  }
})
```

`policy.verifyDocument` returns verified `{ identity, scopes }`. `policy.allowsAgent` authorizes `discover` and each requested scope for the separately authenticated agent. `policy.agentPrincipal` authenticates **every** MCP HTTP request and returns a stable principal or `undefined`. See [host policy contract](../reference/devframe.md#host-setup) for callback details and the lower-level bridge setup.

The helper owns its bridge and Devframe instance; your application owns the server, routing, credentials, and HTTP Host/Origin checks. Its dedicated base must not overlap another helper mount. It disables automatic MCP, SSE, discovery registration, and static assets.

For a cross-origin browser host, allow its exact origin to fetch `https://tools.example.com/tools/histoire/__connection.json` through your HTTP CORS policy, including required preflight handling. Devframe's `allowedOrigins` separately permits the transport connection. The source's `embed.allowedOrigins` permits embedding, while `inspection.allowedOrigins` permits inspection through that embed. Your MCP endpoint still needs its own HTTP origin policy and agent authentication; CORS supplies neither.

## Pair a mounted browser session

After authenticating the browser, create a grant on the server:

```ts
const grant = host.bridge.broker.createGrant({
  principal: browserPrincipal,
  sourceUrl: 'https://books.example.com/stories/',
  scopes: ['inspection', 'events'],
})
```

Deliver `grant.token`, connection settings, and the verified project identity through your application's confidential authenticated channel. A grant expires after 60 seconds and can be redeemed once. Never put it in URLs, discovery records, or logs. It authorizes browser pairing and does not authenticate an agent.

In the browser, connect and mount an explicit variant before attaching. The following assumes your authenticated channel supplied `browserToken`, `grantToken`, and `projectId`:

```ts
import { attachDevframe } from '@histoire/devframe/client'
import { createHistoireSession } from '@histoire/sdk'
import { getDevframeRpcClient } from 'devframe/client'

const session = createHistoireSession({
  url: 'https://books.example.com/stories/',
})
await session.connect()
await session.selection.select({ storyId: 'counter', variantId: 'default' })
const mount = session.mount(document.querySelector<HTMLElement>('#story')!, {
  surface: 'preview',
})
await mount.ready

const connection = await getDevframeRpcClient({
  baseURL: 'https://tools.example.com/tools/histoire/',
  authToken: browserToken,
  webmcp: false,
  simpleAuth: false,
  otpParam: false,
  callTimeout: 3000,
})
await connection.ensureTrusted()

const attachment = await attachDevframe({
  session,
  connection,
  grant: grantToken,
  projectId,
  scopes: ['inspection', 'events'],
})
```

Use actual catalog story and variant IDs and give `#story` a real width and height. The source URL must match the grant's canonical book URL. The host independently verifies project and document identity. Pairing never selects or mounts a story, and effective scopes are limited by the grant, host policy, and SDK capabilities. Keep `webmcp: false`: generic WebMCP registration lacks this adapter's authenticated agent and per-call authorization contract.

Own asynchronous startup in your browser lifecycle: surface failures and release any acquired attachment, connection, and session even if later startup steps fail.

## Inspect through MCP

Configure your MCP client with the endpoint routed above and an independently issued agent credential. Client configuration formats vary; a typical HTTP entry is:

```json
{
  "mcpServers": {
    "histoire-live": {
      "url": "https://tools.example.com/tools/histoire-mcp",
      "headers": { "Authorization": "Bearer <agent-token>" }
    }
  }
}
```

Store the independently issued agent token in your client's secret storage. The browser token and pairing grant belong to the browser session. The endpoint advertises tools for the authorized scopes and lists active attachments the agent can access.

For a programmatic Node client, install `@modelcontextprotocol/client@2.3.1`. Discover a resource and copy its exact owner into each call:

```ts
import type { LiveAttachment } from '@histoire/devframe/node'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const client = new Client({ name: 'inspection-client', version: '1' })
await client.connect(new StreamableHTTPClientTransport(
  new URL('https://tools.example.com/tools/histoire-mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${agentToken}` } } },
))
try {
  const { resources } = await client.listResources()
  const resource = resources.find(item => item.uri.startsWith('histoire://live/'))
  if (!resource) throw new Error('No authorized live session')
  const { contents } = await client.readResource({ uri: resource.uri })
  const content = contents[0]
  if (!content || !('text' in content)) throw new Error('Missing live session record')
  const record = JSON.parse(content.text) as LiveAttachment
  const owner = {
    attachmentId: record.attachmentId,
    target: record.owner.target,
    expectedOwner: record.owner,
  }
  const variant = await client.callTool({
    name: 'histoire_inspect_session',
    arguments: { ...owner, kind: 'variant' },
  })
  const dom = await client.callTool({
    name: 'histoire_inspect_session',
    arguments: { ...owner, kind: 'dom', selector: 'button', maxNodes: 50 },
  })
  // Check variant.isError / dom.isError before consuming structuredContent.
}
finally {
  await client.close()
}
```

For multiple attachments, choose the resource matching your intended source and target rather than taking the first. Successful inspection results have `mode: 'live'` and reflect the mounted document at observation time. Change an unsaved counter value in the canvas, then call again with its current owner to observe that value. See [agent services](../reference/devframe.md#agent-services) for events, components, accessibility, highlights, and diagnostics.

## Recovery and cleanup

Changing selection, replacing the source or runtime, disconnecting, revoking policy, or disposing the session retires the attachment. Wait for the replacement to be ready, get a fresh grant, and attach again. Discover its resource to get the current owner.

On host policy, source, or runtime authority changes, invalidate synchronously:

```ts
/** Revoke affected attachments before returning control to the caller. */
function authorityChanged(attachmentId?: string) {
  authorityVersion++
  host.bridge.invalidate(attachmentId) // Omit the ID to invalidate all.
}
```

Release the browser attachment before its caller-owned connection and session:

```ts
try {
  await attachment.dispose()
}
finally {
  connection.close?.()
  await session.dispose()
}
```

During host shutdown, close both adapter resources before your server:

```ts
try {
  const results = await Promise.allSettled([endpoint.close(), host.dispose()])
  const errors = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason)
  if (errors.length) throw new AggregateError(errors, 'Live inspection cleanup failed')
}
finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}
```

Disposal can reject when retirement fails or times out; propagate that failure to your application's error handling. An ignored rejection does not establish completed cleanup. Remove any caller-installed middleware or request handlers when retaining the server.

For historical JSON and standalone HTML exports, see [detached reports](../reference/devframe.md#detached-reports). For connection and stale-owner errors, see [troubleshooting](../reference/devframe.md#troubleshooting).

## Example integration {#run-the-repository-example}

The local Devframe example shows how an MCP client can read a counter after you edit it in the browser. The example uses temporary credentials and a loopback server. Use your application's authentication and document ownership policy in production. See the [Devframe example README](https://github.com/histoire-dev/histoire/blob/main/examples/vue3/devframe/README.md).
