# 11 — Docs and source panels

## Outcome and prerequisites

Depends on: 03, 08, 09.

Native/iframe docs and source work from deployed static source without host story imports. Raw/docs reads are data-only; dynamic generation stays isolated. [public-api.md](public-api.md) owns modes, sanitizer policy, revision, and runtime requirements.

## Owned files

- Add Vue components/docs/HistoireDocs.vue and docs/{content,sanitize,links,anchors}.ts.
- Add components/source/HistoireSource.vue and source/{content,highlight}.ts.
- Reuse/extract app panel/{StoryDocs,StorySourceCode}.vue and util/docs.ts behavior.
- Consolidate existing duplicated getSourceCode/generator access into owning preview runtime adapter, retaining support-plugin generation.
- Add app/embed/adapters/content.ts, source command registration, Vue DOM/content tests, and browser docs-source.spec.ts.
- Add lazy DOMPurify/syntax-highlighter dependencies only to UI/content consumer package, never core SDK.

## Tests first

1. Sibling, inline Vue, standalone Markdown, empty, absent, and mocked-story docs distinguish content provenance without story execution in host.
2. Nested-base images/links resolve against source; story links select exact target and anchors scroll only within owning panel.
3. Native remote markup removes scripts/event/style/frame/object/embed content and unsafe URL forms while preserving useful Markdown/code links.
4. Preserve explicit source, source slot, generated dynamic source, and raw physical/virtual source choices.
5. Dynamic source without ready matching runtime is unavailable; generator exception is distinct failure. Static raw/docs work without primary.
6. Selection/content revision changes during read/highlight/sanitize; delayed response cannot replace current panel. Two panel anchors with same ID remain independent.

## Implementation steps

1. Consume shared content DTOs and captured revision. Read docs/raw source via source adapter; do not call story loader or setup code from native panel.
2. Use one content request owner per panel. Cancel/inactivate outdated work before selection/revision transition and observe late completions.
3. Normalize source-relative asset/link URLs against book base. Map known story links to structured selection target; safe external links retain explicit destination.
4. Sanitize native remote HTML after URL normalization using DOMPurify HTML profile. Follow [official documentation](https://github.com/cure53/DOMPurify); explicitly forbid scripts/styles/embedded frames/objects and event/style attributes. No unsafe HTML modification after final sanitization.
5. Preserve standalone trusted-local rendering through explicit adapter policy. Custom slots receive DTO but do not bypass default native sanitization.
6. Scope anchor lookup to panel root; do not mutate host URL/title or query global document for docs anchor.
7. Lazy-load sanitizer and highlighter when corresponding panel needs them. Present plain safe text on highlight failure; sanitizer failure never renders unsanitized remote HTML.
8. Dynamic source request routes to captured primary document using existing support-plugin generator. Preserve precedence of explicit source/source slot/generated output; return typed absent versus generation failure.
9. Raw source uses single Node/build physical/virtual reader. UI switches raw/dynamic mode explicitly; unavailable dynamic mode cannot silently execute hidden preview or return misleading raw data.
10. Register docs/source iframe views on same implementation/proxy session and capability registry.

## API changes

Enable HistoireDocs/HistoireSource and docs/source iframe surfaces. source.get mode contract remains authoritative public-api.md. Optional implementation-only formatting/highlight helpers stay outside portable SDK.

## Failure paths

Missing docs/source, rejected read, stale revision, unavailable/mismatched runtime, and generation failure remain distinct. Sanitizer failure yields safe unavailable/text state; no raw HTML fallback. Unsafe link or ambiguous story target cannot dispatch arbitrary URL/file command.

## Validation commands

~~~bash
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/vue build
pnpm --filter @histoire/vue test
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test:embed:integration docs-source
pnpm --filter histoire-example-vue3 test:examples
pnpm run lint
~~~

Serve copied static build under nested base from unrelated host. Validate mocked docs and dynamic source separately from raw data path.

## Acceptance criteria

- Static native docs/raw source require no host story import or primary runtime.
- All existing source choices preserved; dynamic output belongs to ready captured preview.
- Native remote HTML/URLs sanitized and panel anchors isolated.
- Lazy/stale content behavior, nested assets, and standalone rendering regression proven.

## Non-goals

Source editing, arbitrary remote HTML execution, replacing Markdown renderer/generator, host plugin imports, and screenshots API.

## Handoff

Provide content request owner, link target conversion, sanitizer allow/deny policy, dynamic-source adapter, chunk/dependency footprint, and static browser evidence. Slice 12 consumes docs search/selection; slice 14 removes old host-side content execution after parity.
