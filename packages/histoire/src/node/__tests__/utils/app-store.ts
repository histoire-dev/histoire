import { reactive } from 'vue'

/**
 * Module mock standing in for `pinia` when driving an app-side store from this
 * package.
 *
 * `@histoire/app` is a build-only package: it declares no test tooling and
 * neither `vitest` nor a runtime `pinia` build is resolvable from it, so its
 * stores are exercised here — where the harness already lives — with `vue`
 * aliased to the very copy the app resolves (see `vitest.config.ts`).
 *
 * Only `defineStore` is replaced, and it is replaced by an equivalent, not a
 * blank: the store setup body (the code actually under test) runs for real, its
 * refs/computeds are real Vue reactivity, the returned object is wrapped in
 * `reactive()` so refs unwrap on property access exactly like a pinia setup
 * store, and the instance is cached so repeated `useXStore()` calls share it.
 *
 * @returns The object to hand to `vi.doMock('pinia', ...)`.
 */
export function createPiniaStub() {
  return {
    defineStore: (_id: string, setup: () => any) => {
      let store: any
      return () => (store ??= reactive(setup()))
    },
  }
}
