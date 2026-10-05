# 17 — Host channels

## Outcome and prerequisites

Depends on: 08, 12, 16. Implementation, local slice 16 conformance and installed-package acceptance complete; evidence keeps these gates separate. Capability-gated protocol; remote CI unrun, no publication implied.

Story runtime code and the embedding host exchange application messages over opt-in named channels that Histoire relays but never interprets. First consumer: the software factory, which runs its preview-bridge protocol (element picking, anchors, block rects, scroll sync) inside stories (factory H18, [factory requirements](../factory-requirements.md)). Contract: [public-api.md](public-api.md) "Host channels" and "Trust boundary".

## Owned files

- Extend protocol validators with channel.post request and channel.message event payloads; add hostChannels capability.
- Add packages/histoire-sdk/src/session/channels.ts and expose `session.channels.open(name)`.
- Add histoire/client `useHostChannel(name)` in packages/histoire-app/src/app/util/host-channel.ts with relay through the existing preview message path; extend node/virtual/preview-runtime/host-messaging.ts and message-handler.ts with one channel message type.
- Add app/embed/adapters/channels.ts relaying between primary runtime and parent port.
- Extend shared config types/defaults with `embed.channels`.
- Add SDK channel tests and browser host-channels.spec.ts reusing slice 07/08 fixtures.

## Tests first

1. Channel listed in `embed.channels` round-trips JSON both ways with runtimeId and structured target; unlisted name rejects on story side and host side.
2. Payload over 64 KiB, non-JSON value, or more than 50 messages per second is rejected or dropped and counted; host listener never receives it.
3. Selection change, reload, or HMR drops in-flight messages for the old runtime; host-to-story post without ready primary rejects PREVIEW_NOT_READY.
4. Grid surface: story-to-host messages carry the originating variant; host-to-story posts reach the primary selected variant only.
5. Channel data cannot trigger Histoire commands, selection, settings, or URL navigation.

## Implementation steps

1. Validate channel names from config at build/dev start; descriptor advertises enabled names under hostChannels capability.
2. Story side posts through the existing same-origin preview messaging with marker and document identity; wrapper adds runtime/target identity and forwards on the bound port.
3. Parent applies the slice-07 inbound gate (schema, size, rate) before invoking subscribers; subscriber exceptions are isolated.
4. Host-to-story posts route through parent controller to the captured primary runtime; stale runtime rejects.
5. Release listeners and pending request authority on unmount, runtime change, and dispose; never queue messages for replay.

## API changes

Adds capability-gated `session.channels`, `useHostChannel`, config `embed.channels`, request channel.post, and event channel.message. No change to existing commands. Books without the capability report CAPABILITY_UNAVAILABLE.

## Failure paths

Unknown channel, oversized or non-JSON payload, rate overflow, stale runtime, and missing primary fail or drop distinctly. Disconnect drops pending messages; nothing replays.

## Validation commands

~~~bash
pnpm --filter @histoire/protocol test
pnpm --filter @histoire/sdk test
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test:embed:integration host-channels
pnpm run lint
~~~

## Acceptance criteria

- Opt-in named channels relay bounded JSON between story and host with exact identity.
- Hostile or stale traffic never reaches host listeners or Histoire commands.
- Books without channels behave exactly as before.

## Non-goals

Generic plugin event bridge, RPC to Histoire internals, binary payloads, broadcast to non-primary grid variants, and element picking implemented by Histoire.

## Handoff

Provide channel API, limits, identity rules, and browser evidence. Record the factory's first protocol on top in its own plans, not here.

## Implementation handoff — 2026-10-02

Canonical contracts remain in [public-api.md](public-api.md), under "Host channels". Implementation adds these leaves and extends existing owners:

- `packages/histoire-protocol/src/channels.ts`: channel payloads, story handle types, name/payload validators, bounded per-direction rate limiter. Existing bridge and preview-message validators register only finite channel traffic. `@histoire/shared` retains compatibility exports.
- `packages/histoire-sdk/src/session/channels.ts`: parent session API, namespace subscribers, document/source lifetime, rate accounting and observed callback failures. Existing controller, notification and request owners route the capability; no app/framework import enters the SDK.
- `packages/histoire-app/src/app/util/host-channel.ts`: story helper and document-local actor leases. `packages/histoire-app/src/embed/adapters/channels.ts`, the existing primary runtime frame, and Explorer session adapter relay channels through their guarded ports. Existing generated preview-runtime service/message handler performs host delivery and returns canonical null ACK.
- `packages/histoire-shared/src/test-execution.ts` and Vue/Svelte/vanilla support setup hooks: actual framework mount capture. Vue uses the story app's Vue instance; Svelte uses its own context; vanilla captures the connected variant wrapper during synchronous setup/onMount invocation. Nuxt uses the same isolated Vue owner. No ambient owner remains across an awaited callback.
- Existing config resolver, descriptor projection and `histoire/client` entry advertise validated opt-in names and the public story type. Collection, metadata-only bootstrap, disabled sources and custom-controls replicas return dormant handles without listeners or automatic story execution.

Story handles retain their initializing variant even after selection changes. Later nested framework components resolve their actual mount context. Removing a mount permanently retires its actor lease, including removal and reinsertion in the same MutationObserver turn. Replacement document/source disconnect invalidates all old handles and subscribers; opening a handle before any mount grants no replacement authority. Closing releases listener sets even when callers retain unsubscribe functions.

Same-grid selection can temporarily project `runtimeId: null` while its physical document remains active. Channel lifetime and subscriptions use the canonical owned mount document, so that projection does not retire live actors. `post()` still requires a ready selected primary. Message payload retains its originating grid target while the port envelope remains bound to the selected owner. Explorer explicitly forwards that same finite notification across its nested primary.

Rate budgets cover all names and handles within one direction/document. Local counters saturate; they count rate loss, validated inbound losses where recorded, and synchronous/asynchronous consumer failures. They are not end-to-end receipt counters. Rejected consumer promises stay observed without awaiting delivery or creating a queue. A failure settling after document/actor retirement cannot increment a replacement owner's counter. Outgoing invalid input remains an explicit typed rejection rather than a delivery acknowledgment.

Useful red/green regressions cover pre-mount source retirement, same-document selection/open/subscribe, nested explicit actor precedence, dormant controls/collection, batched actor removal, aggregate rate budgets, stale identities, canonical null ACK, mandatory channel document identity, and active/retired asynchronous callback rejection. The public declaration lives in protocol so packed `histoire/client` consumers retain inferred callback types rather than depending on an absent app declaration entry.

Focused evidence, kept as separate runs rather than summed overlapping suites:

- Protocol: 33 tests / 10 files pass (`/tmp/histoire-sdk17-protocol-final-rerun.log`).
- SDK after asynchronous callback repair: 68 tests / 16 files pass (`/tmp/histoire-sdk17-async-sdk-final.log`).
- Story helper dormant/actor/callback tests: 3 tests / 1 file pass (`/tmp/histoire-sdk17-async-story-final.log`). Other actor/config/ACK focused run: 10 tests / 4 files; generated message guards: 14 tests / 1 file. Independent shared actor-scope tests: 5 tests / 1 file.
- Full terminal workspace build passes (`/tmp/histoire-sdk-joint-terminal-workspace-build.log`). Owned source/test lint and whitespace checks pass. New source/test leaves remain below 300 lines.
- Final direct Vue and nested Explorer host-channel browser gate: Chromium 3 tests in 50.98s, Firefox 3 tests in 36.39s, WebKit 3 tests in 32.55s. Logs: `/tmp/histoire-sdk17-vue-{chromium,firefox,webkit}-terminal.log`. Each includes actual dev collection/HMR, copied static nested-base books, distinct host/source origins, both grid actor targets, selected-only host delivery, late nested Vue setup, malformed/stale/unlisted traffic, opaque command-shaped data, rate/size rejection, async consumer isolation, docs-only teardown and disposal, with zero browser errors.
- Cross-framework gate: Svelte 4, Svelte 5, vanilla and Nuxt 4 all pass (4 tests, 53.85s, `/tmp/histoire-sdk17-framework-channels-browser-final.log`). It proves retained async actor handles, later nested Svelte/Nuxt children, dormant module handles, selected-only recipients and teardown. Nuxt 3 runtime compatibility is not claimed by this run.

All browser commands hold the shared build lock for their full lifetime. The default Chromium command is:

~~~bash
flock -s /tmp/histoire-sdk-build.lock pnpm --filter histoire test:embed:integration host-channels.spec
flock -s /tmp/histoire-sdk-build.lock pnpm --filter histoire test:embed:integration host-channels-frameworks.spec
~~~

Firefox adds `HISTOIRE_EMBED_BROWSER=firefox`. WebKit uses `HISTOIRE_EMBED_BROWSER=webkit` plus the explicitly owned remote browser endpoint where native WebKit dependencies are unavailable. SDK commands never reconnect, replay application messages, retry execution, or automatically create a runtime. Selecting an adaptive Explorer grid after an initial preview document retires handles bound to that old document; the initial-grid conformance case selects before mounting to test one exact owner.

Final aggregate browser/workspace tests, packed consumer inference/assets, CI and factory's application protocol remain separately recorded in [validation.md](validation.md). No commit, push, package publication or deployment occurred in this slice.
