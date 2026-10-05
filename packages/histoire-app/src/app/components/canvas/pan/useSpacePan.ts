import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

/** Optional access to the selected tool without mutating its persisted state. */
export interface SpacePanOptions {
  /** Reads the toolbar tool used when Space is released. */
  getTool?: () => string
  /** Owning canvas; keyboard events outside it never acquire pan state. */
  getRoot?: () => HTMLElement | null | undefined
}

/** Detects native form controls and editable descendants where Space is text. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false
  const element = target as HTMLElement
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName?.toUpperCase())
    || Boolean(element.isContentEditable)
    || Boolean(element.closest?.('[contenteditable]:not([contenteditable="false"]), input, textarea, select'))
}

/** Space keeps native activation on buttons, links, tabs, menus and tree items. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return isTypingTarget(target) || ['BUTTON', 'A', 'SUMMARY'].includes(element?.tagName?.toUpperCase())
    || Boolean(element?.closest?.('button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="treeitem"], [role="textbox"]'))
}

/** Uses Space as a temporary pan modifier; releasing it restores the selected tool. */
export function useSpacePan(options: SpacePanOptions = {}) {
  const held = ref(false)
  const effectiveTool = computed(() => held.value ? 'pan' : options.getTool?.() ?? 'select')

  /** Same-origin frame ownership uses its element in parent document. */
  function owns(target: EventTarget | null): boolean {
    if (!options.getRoot) return true
    const root = options.getRoot()
    const element = target as HTMLElement | null
    if (!root || !element) return false
    // Canvas chrome can live inside a host iframe. Map only foreign preview
    // documents to their iframe element; local chrome remains inside root.
    const owner = element.ownerDocument === root.ownerDocument
      ? element
      : element.ownerDocument?.defaultView?.frameElement ?? element
    const nearest = owner.closest?.('.histoire-canvas-viewport')
    return root.contains(owner) && (!nearest || nearest === root)
  }

  /** Enables temporary pan outside text inputs. */
  function onKeyDown(event: KeyboardEvent) {
    if ((event.code !== 'Space' && event.key !== ' ') || !owns(event.target) || isInteractiveTarget(event.target)) return
    event.preventDefault()
    held.value = true
  }

  /** Releases Space even if focus moved into an input during a gesture. */
  function onKeyUp(event: KeyboardEvent) {
    if (event.code === 'Space' || event.key === ' ') release()
  }

  /** Clears temporary state when focus leaves the window or component unmounts. */
  function release() {
    held.value = false
  }

  /** Moving focus out of canvas or onto native controls releases temporary pan. */
  function onFocusIn(event: FocusEvent) {
    if (!owns(event.target) || isInteractiveTarget(event.target)) release()
  }

  if (getCurrentInstance() && options.getRoot) {
    onMounted(() => {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', release)
      window.addEventListener('focusin', onFocusIn)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      window.removeEventListener('focusin', onFocusIn)
      release()
    })
  }

  return { held, spacePressed: held, effectiveTool, onKeyDown, onKeyUp, onFocusIn, release }
}
