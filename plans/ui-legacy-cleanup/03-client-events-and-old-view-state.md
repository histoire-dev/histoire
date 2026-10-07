# 03 — Client events and old view/state chain

Depends on: 01, 02. Owner: event fallback, old router/views/panels/stores and their exclusive tests. Includes dependency-detachment subset listed in inventory.

## Result

Old global router and host viewer/test-state chain disappear. Client `logEvent` keeps sandbox delivery and non-sandbox compatibility behavior without selecting stories through a global router.

## Files

- Modify `app/stores/events.ts`; inspect `app/util/events.ts` and `api.ts`, changing only documentation/necessary decoupling.
- Delete slice 03 paths in inventory, including old tree/folder chain and search/command importers that depend on old story/router state.
- Test ownership: `core-tests/log-event.spec.ts`, `tests-store*.spec.ts`, `preview-runtime-store.spec.ts`, `preview-iframe-host.spec.ts`, `utils/tests-store-harness.ts`; inspect old-only imports across all test files.
- Current replacement suites: `vue-tests/events-panel.spec.ts`, `workbench-tests*.spec.ts`, `tests-controller-lifecycle.spec.ts`, `standalone-runtime-binding.spec.ts`, and `core-tests/embed/runtime-frame-{events,readiness,revisions,selection}.spec.ts`.

## Tests first

1. Keep existing sandbox event marker/same-origin/payload-cleaning cases.
2. Add a host fallback case using a real fresh Pinia instance and actual compatibility events store. Assert cleaned event appended once and unseen incremented; no mocked store implementation for this proof.
3. Two Pinia instances retain independent fallback histories. `reset()` clears events/unseen. Reuse existing Pinia/vendor aliases to avoid mixing framework copies.
4. Runtime scope path publishes once through actual installed callback, retaining actor/document/selection attribution. Cover non-selected grid actor, delayed explicit target and stale frame/document rejection through existing runtime adapter suites.
5. Preserve meaningful run/collect cancellation, navigation retirement, source/catalog revision, request correlation, timeout and disposed-owner cases in current SDK/runtime suites before retiring old host-store tests.
6. Preserve search/command behavior affected by removing old importers: use active `SearchPanel` and `standalone/commands.ts`; follow slice 04 migration cases before deleting detachment subset.

Never translate old concurrency expectations into weak “promise rejects” tests when old suite checked that runner/resources actually retire. Preserve the stronger contract at current owner.

## Change

1. Keep `stores/events.ts` exporting `HstEvent` and `useEventsStore`. Remove `useStoryStore`, selection watcher, and now-unused imports. Keep existing Pinia store name, `events`, `unseen`, `addEvent`, `reset`, and return API. Add JSDoc explaining host compatibility scope and explicit reset ownership.
2. Keep `logEvent` lazy host fallback and existing active-Pinia requirement; do not make it a no-op, add a session global, or route host events into canonical SDK selection.
3. Remove obsolete search/command importers and tree/folder consumers in this same slice, per inventory. Current workbench commands remain untouched except required test migration.
4. Remove old router, Home/story route views, split side panel and its entire internal panel component tree.
5. Remove old `stores/{story,folder,tests,test-collection,tests-utils,preview-runtime}.ts` and `util/preview-iframe-host*` after no remaining source importer references them.
6. Migrate useful tests; delete obsolete old-adapter tests and exclusive harnesses. Retain portable/security helper tests until slice 05 decides helper disposition.
7. Search all source/declarations/templates for removed imports. Fix exact leftovers within owned scope; no placeholder legacy modules to keep typechecking green.

No temporary selection binding is needed: compatibility-store decoupling and old-view removal land together. Current inspector uses SDK event snapshots and existing runtime reset/attribution.

## Validation

- Focused client/runtime events, host compatibility store, run/collect ownership, current Search/command tests.
- Current standalone navigation/docs/selection/runtime-binding tests.
- All three app typecheck graphs; core/native Vue tests that consume deleted paths updated and run.
- Fresh prebundle: no old router/view modules reachable from client API or sandbox URL path.

## Acceptance

- No source imports old router/story/folder/test/runtime stores.
- `components/panel/` old tree removed without changing current inspector behavior.
- Public client API and event wire contract unchanged.
- Host fallback remains a documented minimal compatibility store; canonical SDK events do not depend on it.
- No useful ownership/security regression lost merely because its old adapter was removed.
