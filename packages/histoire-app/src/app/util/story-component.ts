import type { StoryFile } from '../types'
import { markRaw, toRaw } from 'vue'

/**
 * Resolves the component of a story file.
 *
 * `virtual:$histoire-stories` exposes `component` as a loader (`() =>
 * import(...)`) so the story module goes through the Vitest dynamic-import
 * wrapper. The support plugins mounting the story — and the docs panel reading
 * the compiled `<docs>` block — need the resolved component instead: rendering
 * the loader directly makes Vue treat it as a functional component and paint
 * `[object Promise]`.
 *
 * The result is written back onto the file so the module is imported once.
 * `mapFile` never overwrites `component` when remapping, so it survives HMR.
 * Both the read and the write go through the raw file: doing them through the
 * reactive proxy would make a calling watcher depend on its own write and
 * re-run forever.
 *
 * @param file The story file whose component to resolve.
 * @returns The resolved component, or null when it could not be loaded.
 */
export async function resolveStoryFileComponent(file: StoryFile): Promise<any> {
  const rawFile = toRaw(file)
  let component: any = rawFile?.component
  if (!component) {
    return null
  }

  // Already a component: either a plain one or an async component that has
  // finished loading.
  if (component.__asyncResolved) {
    component = component.__asyncResolved
  }
  else if (component.__asyncLoader) {
    component = await component.__asyncLoader()
  }
  else if (typeof component === 'function') {
    try {
      component = await component()
    }
    catch (e) {
      // A support plugin may expose a component that is a class or a plain
      // render function, which calling would throw on: keep the original.
      return rawFile.component
    }
  }

  if (component?.default) {
    component = component.default
  }

  // Components must never become reactive objects (Vue warns and pays for the
  // proxy on every render), which is why `mapFile` marks the original raw.
  component = markRaw(component)
  rawFile.component = component
  return component
}
