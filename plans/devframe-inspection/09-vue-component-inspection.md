# 09 — Framework hook and Vue component inspection

## Outcome and prerequisites

Depends on: 03, 08. Connect picked DOM element to bounded Vue component tree/details/source. Preserve generic inspection on other frameworks.

## Owned files

- New framework inspection hook types in `packages/histoire-shared/src/types/` near existing support-plugin contracts.
- New `packages/histoire-plugin-vue/src/client/inspection/{registry,tree,details,elements,source}.ts`; integrate current app/variant root lifecycle under `client/app/`.
- Runtime inspection command handlers and SDK `inspect.components/component`; optional adapter service descriptor for `histoire_inspect_component`.
- Vue component fixtures and real browser integration; do not duplicate existing framework story generators.

## Tests first

1. Nested component props/tree mapped to exact variant; two roots with same component names do not collide.
2. Picker resolves nearest owning component; fragments, Teleport, slots, async components, and KeepAlive active/inactive instances have defined results.
3. Unmount/HMR invalidates IDs; old component ID cannot resolve newly mounted instance even if framework reuses numeric uid.
4. Getter/computed properties not evaluated; props/setup refs projected safely; cycles/non-serializable values report omissions.
5. Source path outside registered root or missing metadata stays unavailable. React/Svelte return capability unavailable for tree but retain state/DOM reads.

## Implementation steps

1. Define small framework-neutral provider interface: tree, details, element ownership, capability, dispose. Register per runtime/variant; no process-global component map.
2. Reuse Vue application/variant mount roots. Evaluate existing framework/devtools hooks before choosing Vue internal access; isolate version-specific internals inside adapter with feature detection.
3. Generate opaque document-scoped IDs incorporating instance lifetime, not raw Vue uid alone. Traverse bounded active tree; mark partial coverage rather than inventing nodes.
4. Define DOM ownership for Teleport and fragments using runtime's own document; out-of-document or inaccessible targets explicitly unavailable. Slot content ownership follows actual rendering component with optional parent relation, documented in result.
5. Project selected details through shared getter-safe reader; preserve required/default/enum metadata distinction from component instance data.
6. Map verified project-relative source locations and return them as data; editor action stays in existing permission path. No raw `__file` absolute path forwarding. Current editor action opens registered story source; component-file metadata does not authorize arbitrary editor paths. Expose optional Vue panel `openComponentSource` event for a host-provided verified source handler; without that handler, display component location and label existing action explicitly `Open story source`.
7. Add SDK/runtime capability and finite agent descriptor; update capability after framework registration/unregistration.

## API changes

Framework inspection provider, browser component APIs, component-tree/details capabilities, and live component MCP tool. Isolated component-tree API is not promised in this pack; existing isolated automatic prop metadata remains unchanged.

## Failure paths

Unsupported Vue runtime metadata returns unavailable/partial capability, not misleading empty tree. Stale component ID returns `RUNTIME_CHANGED`; invalid input rejects before traversal. No getters evaluated for completeness.

## Validation commands

Framework reader unit tests plus real Vue/Nuxt component fixtures, SDK lifecycle tests, agent component conformance, React/Svelte generic inspection regressions.

## Acceptance criteria

Pick element and inspect correct Vue instance across multiple variants; supported special render structures proven and limitations explicit. No component internals leak across transport.

## Non-goals and handoff

No component mutation, render profiler, reactive dependency graph, or React/Svelte tree implementation. Hand off source/element/component DTOs to 11/13.
