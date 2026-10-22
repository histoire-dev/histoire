import type { UiCommentAttachment } from '@histoire/shared'
import { COMMENT_ATTACHMENT_LIMIT } from '@histoire/shared'
import { onScopeDispose, ref, watch } from 'vue'
import { attachScreenshot, uploadAttachment } from '../../../util/comments-http.js'

/**
 * Files carried by a clipboard or drag event.
 * @param data Event transfer data.
 */
function transferFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return []
  const files = [...data.files ?? []]
  // Some browsers expose pasted images only as items.
  return files.length ? files : [...data.items ?? []].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(file => file !== null)
}

/**
 * Upload, screenshot, paste and drag & drop handling for prompt attachments.
 * Results that finish after the owning component unmounts are dropped, so parents key the
 * prompt by draft identity to keep late uploads out of another draft.
 * @param options Current list accessors.
 * @param options.attachments Current attachments.
 * @param options.update Writes the new list.
 * @param options.disabled Drops are ignored while true.
 */
export function usePromptAttachments(options: { attachments: () => readonly UiCommentAttachment[], update: (value: UiCommentAttachment[]) => void, disabled: () => boolean }) {
  const uploading = ref(0)
  const dropping = ref(false)
  const notice = ref('')
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  /**
   * Last list written or received. Parents mirror updates only on their next render, so
   * reading props mid-batch would count and append against a stale list.
   */
  let latest: readonly UiCommentAttachment[] = options.attachments()
  watch(options.attachments, (value) => {
    latest = value
  })
  onScopeDispose(() => {
    disposed = true
    clearTimeout(noticeTimer)
  })
  /** Write a new list and remember it until the parent echoes it back. */
  function write(value: UiCommentAttachment[]): void {
    latest = value
    options.update(value)
  }
  /** Show a transient failure under the field. */
  function fail(message: string): void {
    clearTimeout(noticeTimer)
    notice.value = message
    noticeTimer = setTimeout(() => notice.value = '', 4000)
  }
  /** Store attachments one by one (uploads, copied screenshots), appending each as soon as it is stored. */
  async function add(stores: Iterable<() => Promise<UiCommentAttachment>>): Promise<void> {
    for (const store of stores) {
      if (disposed) return
      if (latest.length + uploading.value >= COMMENT_ATTACHMENT_LIMIT) {
        fail(`Attach at most ${COMMENT_ATTACHMENT_LIMIT} files`)
        break
      }
      uploading.value++
      try {
        const stored = await store()
        if (!disposed) write([...latest, stored])
      }
      catch (error) {
        if (!disposed) fail(error instanceof Error ? error.message : 'Cannot attach file')
      }
      finally { uploading.value-- }
    }
  }
  /** Upload picked, pasted or dropped files. */
  function addFiles(files: Iterable<File>): Promise<void> {
    return add([...files].map(file => () => uploadAttachment(file)))
  }
  /** Whether a drag carries files. */
  function hasFiles(event: DragEvent): boolean {
    return [...event.dataTransfer?.types ?? []].includes('Files')
  }
  return { uploading, dropping, notice, addFiles, fail,
    /** Attach a stored screenshot (captured or recent) as a copy. */
    addScreenshot(path: string): Promise<void> {
      return add([() => attachScreenshot(path)])
    },
    /** Detach one stored file. */
    remove(path: string): void {
      write(latest.filter(file => file.path !== path))
    },
    /** Pasted files become attachments; text (even with a file rendering, e.g. spreadsheet cells) pastes normally. */
    paste(event: ClipboardEvent): void {
      const files = transferFiles(event.clipboardData)
      if (!files.length || event.clipboardData?.getData('text/plain').trim()) return
      event.preventDefault()
      void addFiles(files)
    },
    /** Accept file drags and highlight the box; a locked prompt refuses them. */
    dragover(event: DragEvent): void {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (options.disabled()) {
        // Prevented with no effect: the browser neither drops here nor opens the file.
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
        return
      }
      dropping.value = true
    },
    /** Drag left the box. */
    dragleave(event: DragEvent): void {
      if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) dropping.value = false
    },
    /** Dropped files become attachments unless the prompt is locked. */
    drop(event: DragEvent): void {
      dropping.value = false
      const files = transferFiles(event.dataTransfer)
      if (!files.length) return
      event.preventDefault()
      if (!options.disabled()) void addFiles(files)
    } }
}
