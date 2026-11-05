import { ref } from 'vue'

/** Copy reviewed text, preserving selectable output when clipboard access fails. */
export function useCopy() {
  const status = ref('')
  /** Report clipboard denial without discarding source text. */
  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      status.value = 'Copied'
    }
    catch { status.value = 'Could not copy. Select and copy the text.' }
  }
  return { status, copy }
}
