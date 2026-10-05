# Slice 16 — Deterministic capture, globals, and factory host proof

Status: planned, not implemented. Source: [factory requirements](../factory-requirements.md) H1, H3–H6, H15, H21. Contract: [contracts](contracts.md#planned-additive-changes-slice-16).

## Outcome and prerequisites

Screenshots become reproducible enough for visual baselines, accept theme globals and device scale, and are proven for Nuxt 4 under a nested base. The same browser service backs the embed SDK Node `captureScreenshot` ([embed slice 13](../embeddable-sdk/13-test-execution-and-cancellation.md)). Depends on 09, 12, 14; `globals` delivery depends on [embed slice 08](../embeddable-sdk/08-preview-and-grid-runtime-ownership.md).

## File ownership

- Modify `packages/histoire/src/node/mcp/protocol/tool-schema.ts` for strict screenshot input and `operations/admission.ts` for request-key normalization.
- Modify `protocol/operation-schema.ts` for PNG result bounds; verify `operations/store.ts` retention/projection validates scaled dimensions without assuming CSS viewport size.
- Modify `packages/histoire/src/node/mcp/browser/{session,screenshot,preview-host,readiness,preview-script}.ts` for target option propagation, context options, device-pixel PNG checks, fixed determinism stylesheet, and two-frame settle.
- Adapt `mcp/browser/dev.ts` and `deploy/execution.ts` to forward validated DPR/globals without bypassing strict input or result validation.
- Modify `packages/histoire-plugin-nuxt/src/index.ts` and its runtime app setup only if the Nuxt nested-base proof fails (runtime `app.baseURL` is hard-coded to `/`).
- Extend `packages/histoire/src/node/__tests__/mcp/{contracts,screenshot,preview-readiness,operation-retention,operation-tools}.spec.ts` and `integration/frameworks.spec.ts` for strict inputs, result storage/projection, and real capture; reuse `__tests__/fixtures/mcp-preview`.
- Update `docs/guide/mcp.md` and `docs/reference/mcp.md`.

## Tests first

1. Fixture story with a running CSS animation, a transition, a focused input caret, and a `Date`/`Intl` timezone label: two captures return identical SHA-256 and the label shows UTC.
2. `deviceScaleFactor: 2` doubles decoded PNG dimensions; strict tool input accepts DPR/globals; 0, 4, and non-integers fail before admission. Cover maximum CSS viewport at DPR 3 (11520 by 6480 PNG) through capture, result schema, retention, and poll/resource projection. Use low-entropy fixture so dimension proof stays within 4 MiB; separately prove an oversized valid PNG fails RESULT_TOO_LARGE. DPR 1 retains original dimensions.
3. `globals: { theme: 'contrast' }` changes rendered semantic text in dev and in a copied Node artifact; invalid keys/values fail validation. Until embed slice 08 lands, `globals` reports CAPABILITY_UNAVAILABLE instead of being ignored.
4. Nuxt 4 example under custom base `/book/`: remove the nuxt4 base-check skip in `integration/frameworks.spec.ts`; dev, static, and Node runs report the base and capture successfully.
5. Same requestKey with different `globals` or `deviceScaleFactor` fails `REQUEST_KEY_CONFLICT`.

## Implementation steps

1. Extend tool-schema.ts strict screenshot input with `deviceScaleFactor` and `globals`; canonicalize default DPR and globals key order in request fingerprint. Use one globals validator shared with embed protocol once it exists; propagate validated options through dev/deploy adapters and PreviewHostTarget.
2. Create each capture context with `deviceScaleFactor`, `reducedMotion: 'reduce'`, `timezoneId: 'UTC'`, `locale: 'en-US'`. Capture PNG with explicit `scale: 'device'`. Compare decoded dimensions with target CSS width/height multiplied by DPR, not original viewport dimensions. Update operation-schema.ts pixel bounds per [planned contract](contracts.md#planned-additive-changes-slice-16), retain target/hash/byte checks, and keep 4 MiB limit independent. Fixed host script disables animations, transitions, and caret; no caller-provided CSS/script.
3. After fonts readiness, wait two animation frames within the existing 30-second deadline.
4. Deliver `globals` through PREVIEW_SETTINGS_SYNC exactly as embed slice 08 defines; no second settings message.
5. Later (H6): optional `rects: { attribute }` collects up to 500 rects for a validated `data-*` attribute in the captured viewport through fixed host code.
6. Later (H5): expose one shared batch entry on the browser session (one browser, fresh context per target) for the Node SDK `captureScreenshots`; MCP keeps one operation per target.
7. Document deterministic defaults, the `sandboxUrl` limitation, and shared-host guidance (`HISTOIRE_MCP_TOKEN` or `--no-mcp` when several projects or untrusted code share a network namespace).

## Acceptance and validation

Focused screenshot/readiness/input/result suites, real Chromium probe in dev and copied Node artifact, maximum viewport/DPR 3 retention and polling, over-byte-limit rejection, Nuxt framework conformance under custom base, shared/core builds, scoped lint. Record SHA-256 equality, CSS/PNG dimensions, and Nuxt base results in [evidence](evidence.md).

## Non-goals and handoff

No pixel baselines, visual diffing, arbitrary selectors or scripts, full-page capture, MCP batch tool, or cross-browser capture. Handoff: deterministic options, CSS-versus-PNG dimension contract, strict input/result schemas, and globals path consumed by embed slice 13.
