/** Public Vitest exports outside collection, including explicit unsupported APIs. */
export const STORY_COMPATIBILITY_CODE = `
/** Fails explicitly when an API requires a real Vitest worker. */
function unsupportedRuntimeFeature(feature) {
  throw new Error(\`\${feature} is not supported inside Histoire story runtime.\`)
}

/** Provides a chainable runtime no-op for compile-time type assertions. */
function createTypeExpect() {
  return new Proxy(() => undefined, {
    get: (_target, property) => property === 'then' ? undefined : createTypeExpect(),
    apply: () => createTypeExpect(),
  })
}

export const vitest = vi
export { expect }
export { chai }
export const assert = chai.assert
export const should = chai.should
export const expectTypeOf = createTypeExpect
/** Leaves compile-time type checking to TypeScript. */
export function assertType() {}
/** Reads context provided by the active Vitest worker. */
export function inject(key) {
  return globalThis.__vitest_worker__?.providedContext?.[key]
}
export const mocker = globalThis.__vitest_mocker__
/** Skips benchmark registration in the story preview. */
const ignoreBenchmark = () => {}
export const bench = Object.assign(ignoreBenchmark, {
  only: ignoreBenchmark,
  skip: ignoreBenchmark,
  todo: ignoreBenchmark,
})
/** Common failure path for runner classes unavailable in story iframes. */
class UnsupportedVitestRuntime {
  /** Rejects instantiation outside the real Vitest runner. */
  constructor() {
    unsupportedRuntimeFeature('Vitest runner classes')
  }
}
/** Compatibility export for imports of Vitest's benchmark runner. */
export class BenchmarkRunner extends UnsupportedVitestRuntime {}
/** Compatibility export for imports of Vitest's module evaluator. */
export class EvaluatedModules extends UnsupportedVitestRuntime {}
/** Compatibility export for imports of Vitest's test runner. */
export class TestRunner extends UnsupportedVitestRuntime {}
/** Reports unsupported snapshots through the matcher result contract. */
const unsupportedSnapshotResult = () => ({
  pass: false,
  message: () => 'Snapshot assertions are not supported inside Histoire story runtime.',
})
export const Snapshots = Object.freeze({
  toMatchSnapshot: unsupportedSnapshotResult,
  toMatchInlineSnapshot: unsupportedSnapshotResult,
  toMatchFileSnapshot: unsupportedSnapshotResult,
})
/** Rejects artifacts because no artifact recorder exists in this runtime. */
export function recordArtifact() {
  unsupportedRuntimeFeature('recordArtifact')
}
`
