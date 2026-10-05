import type { InjectionKey } from 'vue'
import type { ShellStore } from '../stores/shell.js'
import { inject, provide } from 'vue'

/** Each Vue workbench tree receives explicit caller-owned shell state. */
const key: InjectionKey<ShellStore> = Symbol('Histoire workbench shell')

/** Bind shell without taking session or lifecycle ownership. */
export function provideShell(shell: ShellStore): void {
  provide(key, shell)
}

/** Components depend on narrow shell contract instead of route/global state. */
export function useShell(): ShellStore {
  const shell = inject(key)
  if (!shell) throw new Error('Histoire workbench shell is required')
  return shell
}
