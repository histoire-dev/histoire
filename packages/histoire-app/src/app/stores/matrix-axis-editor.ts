import type { Ref } from 'vue'
import { computed, shallowRef, watch } from 'vue'

/**
 * Axis authoring UI state shared by the inspector and canvas guidance.
 * At most one editor is open: either the new-axis form or one axis' values.
 */
export function createMatrixAxisEditor(storyId: Readonly<Ref<string>>) {
  const editing = shallowRef('')
  const adding = shallowRef(false)
  // Drafts never cross a story boundary.
  watch(storyId, close, { flush: 'sync' })

  /** Open values editor for one axis, closing any other editor. */
  function edit(name: string): void {
    adding.value = false
    editing.value = name
  }

  /** Open the new-axis form, closing any axis editor. */
  function add(): void {
    editing.value = ''
    adding.value = true
  }

  /** Close whichever editor is open. */
  function close(): void {
    editing.value = ''
    adding.value = false
  }

  return {
    /** Name of the axis whose values editor is open, or empty. */
    editing: computed(() => editing.value),
    /** Whether the new-axis form is open. */
    adding: computed(() => adding.value),
    edit,
    add,
    close,
  }
}

export type MatrixAxisEditor = ReturnType<typeof createMatrixAxisEditor>
